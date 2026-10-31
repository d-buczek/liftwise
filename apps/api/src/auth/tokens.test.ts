import { describe, expect, it } from 'vite-plus/test';
import {
  PAIRING_CODE_LENGTH,
  generatePairingCode,
  generateToken,
  normalizePairingCode,
  sha256Hex,
} from './tokens';

describe('tokens', () => {
  it('generates 32-byte base64url tokens', () => {
    const token = generateToken();
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(generateToken()).not.toBe(token);
  });

  it('generates pairing codes without ambiguous characters', () => {
    const codes = Array.from({ length: 50 }, generatePairingCode).join('');
    expect(codes).toHaveLength(50 * PAIRING_CODE_LENGTH);
    expect(codes).toMatch(/^[2-9A-HJ-NP-Z]+$/);
  });

  it('normalizes typed codes', () => {
    expect(normalizePairingCode(' ab3d-ef7h ')).toBe('AB3DEF7H');
  });

  it('hashes with SHA-256 as hex', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
