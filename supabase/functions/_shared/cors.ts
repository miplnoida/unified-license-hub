// Shared CORS helper with an env-configured allowlist.
//
// Allowed origins come from the optional ALLOWED_ORIGINS secret (comma-separated).
// If unset, defaults to local dev + lovable preview/published domains.
// Requests from unknown origins receive `Access-Control-Allow-Origin: null`,
// which browsers treat as a CORS denial.

const DEFAULT_ALLOWED_PATTERNS: RegExp[] = [
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^https:\/\/([a-z0-9-]+\.)*lovable\.app$/,
  /^https:\/\/([a-z0-9-]+\.)*lovableproject\.com$/,
  /^https:\/\/([a-z0-9-]+\.)*lovable\.dev$/,
];

function getEnvAllowedOrigins(): (string | RegExp)[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS");
  if (!raw) return DEFAULT_ALLOWED_PATTERNS;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true; // server-to-server / curl
  const list = getEnvAllowedOrigins();
  for (const entry of list) {
    if (typeof entry === "string") {
      if (entry === "*" || entry === origin) return true;
    } else if (entry.test(origin)) {
      return true;
    }
  }
  return false;
}

export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowed = isOriginAllowed(origin);
  return {
    "Access-Control-Allow-Origin": allowed && origin ? origin : "null",
    "Vary": "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { headers: buildCorsHeaders(req) });
}
