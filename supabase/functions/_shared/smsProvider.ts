// SMS provider extension point.
//
// There is deliberately NO implementation: this deployment has no SMS provider,
// no approved sender ID and no credentials. The dispatcher therefore records SMS
// dispatch attempts as `skipped` with reason `sms_provider_not_configured`
// instead of inventing a success record, and the channel-health surface reports
// SMS as unavailable.
//
// To add a provider later: implement SmsProvider, return a real provider message
// id, and replace `resolveSmsProvider()` with a configuration-driven lookup.

export interface SmsSendResult {
  providerMessageId: string;
  /** Provider-reported state at submission time — never assume delivery. */
  status: "queued" | "sent" | "failed";
  error?: string;
}

export interface SmsProvider {
  readonly name: string;
  /** E.164 formatted destination. */
  send(to: string, body: string): Promise<SmsSendResult>;
}

export const SMS_UNAVAILABLE_REASON = "sms_provider_not_configured";

/** Always null today — no provider is configured for this deployment. */
export function resolveSmsProvider(): SmsProvider | null {
  return null;
}

/** Normalise a phone number to E.164, or null when it cannot be trusted. */
export function toE164(raw: string | null | undefined, defaultCountryCode = ""): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
  if (!defaultCountryCode) return null;
  const candidate = `+${defaultCountryCode.replace(/\D/g, "")}${digits.replace(/^0+/, "")}`;
  return /^\+\d{8,15}$/.test(candidate) ? candidate : null;
}
