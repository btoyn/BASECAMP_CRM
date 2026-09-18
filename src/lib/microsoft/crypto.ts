import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encryption for the tokens at rest.
 *
 * RLS already stops one user reading another's row. This is for the other
 * threat: a database dump, a backup on someone's laptop, a support export.
 * A refresh token in the clear is standing access to a mailbox and a calendar,
 * so it does not sit in a text column unencrypted.
 *
 * AES-256-GCM from node's own crypto — authenticated, so a tampered ciphertext
 * fails loudly instead of decrypting to rubbish, and no new dependency.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits, the size GCM is specified for
const VERSION = "v1";

/**
 * A 32-byte key from whatever the environment variable holds.
 *
 * Hashed rather than parsed so any passphrase works and a short one can't
 * silently produce a weak key — though a long random value is still the right
 * thing to set.
 */
function keyFrom(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

/** `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function encryptToken(plaintext: string, secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyFrom(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptToken(encoded: string, secret: string): string {
  const [version, iv, tag, ciphertext] = encoded.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error("Stored token is not in a format this version understands.");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    keyFrom(secret),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** PKCE: a verifier to keep, and the challenge that goes to Microsoft. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function randomState(): string {
  return randomBytes(16).toString("base64url");
}
