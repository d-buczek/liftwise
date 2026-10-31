// No imports: scripts/device-create.ts runs this file directly in Node (type stripping).

const TOKEN_BYTES = 32;

// Pairing codes are typed by hand or scanned: no 0/O and 1/I. 32 symbols, so `byte % 32`
// is uniform.
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const PAIRING_CODE_LENGTH = 8;

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

// Device token: 32 random bytes, base64url (§6.8). Shown once; only its hash is stored.
export function generateToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

export function generatePairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(PAIRING_CODE_LENGTH));
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

// Accepts the code as typed: any case, with spaces or dashes between groups.
export function normalizePairingCode(input: string): string {
  return input.toUpperCase().replaceAll(/[\s-]/g, '');
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
