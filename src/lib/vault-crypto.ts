import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// AES-256-GCM, keyed by a single master key from the environment
// (VAULT_MASTER_KEY, 32 raw bytes base64-encoded). A fresh random IV is
// generated per encryption; the GCM auth tag is stored alongside the
// ciphertext so tampering/corruption is detected on decrypt rather than
// silently producing garbage.
function getKey(): Buffer {
  const raw = process.env.VAULT_MASTER_KEY;
  if (!raw) throw new Error('VAULT_MASTER_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('VAULT_MASTER_KEY must decode to exactly 32 bytes');
  return key;
}

export function encryptVaultValue(plaintext: string): { encryptedValue: string; iv: string; authTag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    encryptedValue: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptVaultValue(encryptedValue: string, iv: string, authTag: string): string {
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
