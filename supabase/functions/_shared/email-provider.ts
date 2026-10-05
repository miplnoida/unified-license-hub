/**
 * Canonical outbound email provider router.
 *
 * Delivery order (fixed):
 *   1. RESEND  (primary)
 *   2. SMTP    (fallback — the pre-existing nodemailer implementation)
 *
 * Design constraints:
 *  - Backward compatible: if no Resend/email-delivery configuration exists,
 *    behaviour is exactly the previous SMTP-only behaviour.
 *  - Never throws for provider problems; callers receive a controlled result so
 *    business workflows are never rolled back by an email channel failure.
 *  - Provider acceptance is `sent`, never `delivered` (delivery is only
 *    confirmed by a provider webhook).
 *  - Hard recipient failures (invalid syntax, permanent rejection) do NOT
 *    trigger fallback; infrastructure failures (quota, rate limit, timeout,
 *    outage, auth/config) DO.
 */
import { isHardFailure, redact } from "./notification-redact.ts";

export const DEFAULT_FROM_NAME = "OLRAS";
export const DEFAULT_FROM_EMAIL = "OLRAS@mishainfotech.us";

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  encryption: "none" | "ssl" | "tls";
  fromName: string;
  fromEmail: string;
  enabled: boolean;
}

export interface EmailGeneralConfig {
  enabled: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  autoFallback: boolean;
}

export interface ResendConfig {
  enabled: boolean;
  apiKey: string | null;
  status: string;
}

export interface EmailDeliveryConfig {
  general: EmailGeneralConfig;
  resend: ResendConfig;
  smtp: SmtpConfig | null;
}

export interface ProviderAttempt {
  provider: "resend" | "smtp";
  ok: boolean;
  error?: string;
  hardFailure?: boolean;
  skippedReason?: string;
}

export interface EmailSendResult {
  success: boolean;
  provider: "resend" | "smtp" | null;
  messageId: string | null;
  error?: string;
  hardFailure: boolean;
  emailDeliveryFailed: boolean;
  attempts: ProviderAttempt[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidRecipient(to: unknown): boolean {
  return typeof to === "string" && EMAIL_RE.test(to.trim());
}

/** Read the effective email delivery configuration (settings + server-only secret). */
/** Server-only provider secret: secure table first, platform secret second. Never site_settings. */
export async function readProviderSecret(supabase: any, key: string, envName: string): Promise<string | null> {
  try {
    const { data } = await supabase.from("email_provider_secrets").select("value").eq("key", key).maybeSingle();
    const v = (data?.value as string | undefined) || null;
    if (v) return v;
  } catch { /* fall through */ }
  return Deno.env.get(envName) || null;
}

export async function loadEmailDeliveryConfig(supabase: any): Promise<EmailDeliveryConfig> {
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "email_sms_settings")
    .maybeSingle();

  const value = (data?.value ?? {}) as Record<string, any>;
  const rawSmtp = value.smtp as SmtpConfig | undefined;
  const rawGeneral = (value.email ?? {}) as Partial<EmailGeneralConfig>;
  const rawResend = (value.resend ?? {}) as Partial<ResendConfig> & { apiKey?: string };

  // SEC-CRED-01: the SMTP password comes ONLY from server-side secret storage
  // (email_provider_secrets, then SMTP_PASSWORD env). Never from site_settings.
  const smtpPassword = await readProviderSecret(supabase, "smtp_password", "SMTP_PASSWORD");
  const smtpUsable = !!(
    rawSmtp && rawSmtp.enabled && rawSmtp.host && rawSmtp.port &&
    rawSmtp.username && smtpPassword && rawSmtp.fromEmail
  );

  // Server-only Resend key: dedicated table first, environment secret second.
  let resendKey: string | null = null;
  try {
    const { data: secret } = await supabase
      .from("email_provider_secrets")
      .select("value")
      .eq("key", "resend_api_key")
      .maybeSingle();
    resendKey = (secret?.value as string | undefined) || null;
  } catch {
    resendKey = null;
  }
  if (!resendKey) resendKey = Deno.env.get("RESEND_API_KEY") || null;

  return {
    general: {
      // Absent configuration must not disable email: default to enabled.
      enabled: rawGeneral.enabled !== false,
      fromName: rawGeneral.fromName || DEFAULT_FROM_NAME,
      fromEmail: rawGeneral.fromEmail || DEFAULT_FROM_EMAIL,
      replyTo: rawGeneral.replyTo || "",
      autoFallback: rawGeneral.autoFallback !== false,
    },
    resend: {
      enabled: rawResend.enabled === true,
      apiKey: resendKey,
      status: rawResend.status || "not_configured",
    },
    smtp: smtpUsable ? ({ ...(rawSmtp as SmtpConfig), password: smtpPassword! }) : null,
  };
}

/** Classify a provider error: hard recipient failure vs retryable infrastructure failure. */
export function classifyProviderError(message: string, status?: number): { hard: boolean } {
  const m = (message || "").toLowerCase();
  // Infrastructure problems come first: quota, rate limit, throttling, outage,
  // timeouts and connectivity must trigger fallback, never poison the message.
  if (
    /quota|sending limit|rate limit|too many|throttl|try again later|temporar|timeout|timed out|econn|etimedout|enotfound|socket|unavailable|service (is )?down|5\.4\.5|4\.7\.0|\b421\b|\b429\b|\b45\d\b|\b50[023]\b|\b504\b/
      .test(m)
  ) {
    return { hard: false };
  }
  if (
    /invalid.*(recipient|email|to address)|recipient.*(invalid|rejected|not found)|no such user|mailbox (unavailable|not found)|user unknown|domain not found|5\.1\.[01]|\b550\b|\b553\b/
      .test(m)
  ) {
    return { hard: true };
  }
  if (status === 422) return { hard: true };
  if (isHardFailure(message)) return { hard: true };
  return { hard: false };
}


export interface SendEmailInput {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}

async function sendViaResend(
  cfg: EmailDeliveryConfig,
  input: SendEmailInput,
): Promise<{ messageId: string | null }> {
  const fromName = cfg.general.fromName || DEFAULT_FROM_NAME;
  const fromEmail = cfg.general.fromEmail || DEFAULT_FROM_EMAIL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.resend.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [input.to],
        subject: input.subject,
        text: input.text || undefined,
        html: input.html || undefined,
        reply_to: input.replyTo || cfg.general.replyTo || undefined,
      }),
      signal: controller.signal,
    });
    const bodyText = await res.text();
    if (!res.ok) {
      let detail = bodyText;
      try {
        const parsed = JSON.parse(bodyText);
        detail = parsed?.message || parsed?.error?.message || bodyText;
      } catch { /* keep raw text */ }
      const err = new Error(redact(`resend_error_${res.status}: ${detail}`));
      (err as any).status = res.status;
      throw err;
    }
    let id: string | null = null;
    try { id = (JSON.parse(bodyText)?.id as string) || null; } catch { id = null; }
    return { messageId: id };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      const err = new Error("resend_timeout: no response within 20s");
      (err as any).status = 504;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Existing SMTP implementation (nodemailer) — unchanged behaviour.
 * The global From is used unless SMTP carries its own From override, because
 * some SMTP providers require an authenticated sender match.
 */
export async function sendViaSmtp(
  smtp: SmtpConfig,
  input: SendEmailInput,
  general?: EmailGeneralConfig,
): Promise<{ messageId: string | null }> {
  const nodemailer = (await import("npm:nodemailer@6.9.16")).default;
  const secure = smtp.encryption === "ssl";
  const requireTLS = smtp.encryption === "tls";
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port),
    secure,
    requireTLS,
    auth: { user: smtp.username, pass: smtp.password! },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  const fromEmail = smtp.fromEmail || general?.fromEmail || DEFAULT_FROM_EMAIL;
  const fromName = smtp.fromName || general?.fromName || DEFAULT_FROM_NAME;
  try {
    const info: any = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html || undefined,
      replyTo: input.replyTo || general?.replyTo || undefined,
    });
    return { messageId: typeof info?.messageId === "string" ? info.messageId : null };
  } catch (e: any) {
    const raw = e?.message || String(e);
    const code = e?.code || "";
    let friendly = raw;
    if (/ETIMEDOUT|ESOCKET|ECONNRESET|wrong version number|SSL|TLS/i.test(raw)) {
      friendly = `TLS/connection issue: ${raw}. Check encryption (SSL=465, TLS=587, None=25).`;
    } else if (code === "EAUTH" || /535|534|invalid login|authentication/i.test(raw)) {
      friendly = "SMTP authentication failed. Check username and password.";
    } else if (code === "ECONNECTION" || /ECONNREFUSED|ENOTFOUND|getaddrinfo|dns/i.test(raw)) {
      friendly = `Cannot reach SMTP server ${smtp.host}:${smtp.port}. ${raw}`;
    }
    throw new Error(redact(friendly));
  }
}

/**
 * Canonical dispatcher: Resend first, then SMTP.
 * Never throws — always returns a controlled result.
 */
export async function sendEmailWithFallback(
  cfg: EmailDeliveryConfig,
  input: SendEmailInput,
): Promise<EmailSendResult> {
  const attempts: ProviderAttempt[] = [];

  const fail = (error: string, hard: boolean): EmailSendResult => ({
    success: false, provider: null, messageId: null, error,
    hardFailure: hard, emailDeliveryFailed: true, attempts,
  });

  if (!isValidRecipient(input.to)) {
    attempts.push({ provider: "resend", ok: false, skippedReason: "invalid_recipient" });
    return fail("invalid_recipient", true);
  }
  if (!cfg.general.enabled) {
    return fail("email_delivery_disabled", false);
  }

  const resendReady = cfg.resend.enabled && !!cfg.resend.apiKey;
  if (resendReady) {
    try {
      const { messageId } = await sendViaResend(cfg, input);
      attempts.push({ provider: "resend", ok: true });
      return {
        success: true, provider: "resend", messageId,
        hardFailure: false, emailDeliveryFailed: false, attempts,
      };
    } catch (e: any) {
      const msg = redact(e?.message || String(e));
      const { hard } = classifyProviderError(msg, e?.status);
      attempts.push({ provider: "resend", ok: false, error: msg, hardFailure: hard });
      if (hard) return fail(msg, true);                       // recipient problem: no fallback
      if (!cfg.general.autoFallback) return fail(msg, false);  // fallback switched off
    }
  } else {
    attempts.push({
      provider: "resend",
      ok: false,
      skippedReason: !cfg.resend.enabled ? "resend_disabled" : "resend_api_key_missing",
    });
  }

  if (!cfg.smtp) {
    const priorResendError = attempts.find((a) => a.provider === "resend" && a.error)?.error;
    return fail(priorResendError ? `${priorResendError}; smtp_not_configured` : "smtp_not_configured", false);
  }

  try {
    const { messageId } = await sendViaSmtp(cfg.smtp, input, cfg.general);
    attempts.push({ provider: "smtp", ok: true });
    return {
      success: true, provider: "smtp", messageId,
      hardFailure: false, emailDeliveryFailed: false, attempts,
    };
  } catch (e: any) {
    const msg = redact(e?.message || String(e));
    const { hard } = classifyProviderError(msg);
    attempts.push({ provider: "smtp", ok: false, error: msg, hardFailure: hard });
    return fail(msg, hard);
  }
}
