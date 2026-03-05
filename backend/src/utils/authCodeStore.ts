/**
 * In-memory store for short-lived one-time auth codes.
 * Used to exchange a one-time code for a token without exposing the token in URLs.
 * Codes expire after 60 seconds and are single-use.
 */

interface StoredAuthData {
  token: string;
  expiresAt: number;
}

const CODE_TTL_MS = 60 * 1000; // 60 seconds
const store = new Map<string, StoredAuthData>();

/**
 * Generate and store a one-time code for the given token.
 * Returns the code to include in redirect URL.
 */
export function createAuthCode(token: string): string {
  const code = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  store.set(code, {
    token,
    expiresAt: Date.now() + CODE_TTL_MS,
  });
  return code;
}

/**
 * Exchange a one-time code for the token. Deletes the code on successful exchange.
 * Returns the token or null if code is invalid/expired.
 */
export function exchangeAuthCode(code: string): string | null {
  const stored = store.get(code);
  if (!stored) return null;
  store.delete(code); // Single-use
  if (Date.now() > stored.expiresAt) return null;
  return stored.token;
}
