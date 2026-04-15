/**
 * Runtime validation for required environment variables.
 * Called once at app startup to fail fast with clear error messages.
 */

const REQUIRED_ENV_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
] as const;

export function validateEnv(): void {
  const missing: string[] = [];

  for (const key of REQUIRED_ENV_VARS) {
    const value = import.meta.env[key];
    if (!value || typeof value !== 'string' || value.trim() === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    const message = `[Config Error] Missing required environment variables:\n${missing.map(k => `  - ${k}`).join('\n')}\n\nCheck your .env file or deployment configuration.`;
    console.error(message);
    throw new Error(message);
  }
}
