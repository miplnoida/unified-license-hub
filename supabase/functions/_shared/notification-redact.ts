// Redaction helpers for notification logging.
//
// Error text from SMTP/provider libraries can echo credentials or full message
// bodies. Everything written to notification_dispatch_log.error or surfaced in
// the channel-health view passes through here first.

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/(pass(word)?|secret|token|api[_-]?key|key)\s*[:=]\s*\S+/gi, "$1=[redacted]"],
  [/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]"],
  [/AUTH\s+[A-Za-z0-9+/=]{8,}/gi, "AUTH [redacted]"],
];

export function redact(input: unknown, maxLength = 500): string {
  let text = typeof input === "string" ? input : String((input as any)?.message ?? input ?? "");
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text.slice(0, maxLength);
}

/** Mask an email address for display in health/admin surfaces. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return "[redacted]";
  return `${email[0]}***${email.slice(at)}`;
}

/** True when the SMTP/provider error is permanent and must not be retried. */
export function isHardFailure(error: string): boolean {
  return /no such user|mailbox unavailable|recipient rejected|user unknown|invalid recipient|smtp authentication failed|550|553/i
    .test(error);
}
