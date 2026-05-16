import { createHash, timingSafeEqual } from 'node:crypto';

// Builds a verifier for a single shared API token. The server only ever holds
// the SHA-256 hash of the token; the plaintext token lives with the client.
export function makeTokenVerifier(expectedHashHex) {
  const expected = Buffer.from(expectedHashHex, 'hex');

  return function verify(authorizationHeader) {
    if (typeof authorizationHeader !== 'string') return false;

    const match = /^Bearer (.+)$/.exec(authorizationHeader.trim());
    if (!match) return false;

    const presented = createHash('sha256').update(match[1]).digest();
    return (
      presented.length === expected.length &&
      timingSafeEqual(presented, expected)
    );
  };
}
