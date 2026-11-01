import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { randomBytes } from 'node:crypto';
export const TESTER_A = 'owner-a@example.test', TESTER_B = 'owner-b@example.test';
export async function accessAuthority() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const kid = crypto.randomUUID(), jwk = { ...await exportJWK(publicKey), kid, use: 'sig', alg: 'RS256' };
  const team = 'https://fixture-' + randomBytes(6).toString('hex') + '.cloudflareaccess.com', aud = randomBytes(32).toString('hex');
  async function mint(options = {}) {
    const now = Math.floor(Date.now()/1000);
    const claims = { email: options.email ?? TESTER_A, sub: options.subject ?? 'synthetic-owner-a', type: 'app', ...options.claims };
    return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid, ...options.header })
      .setIssuer(options.issuer ?? team).setAudience(options.audience ?? aud)
      .setIssuedAt(options.issuedAt ?? now-1).setNotBefore(options.notBefore ?? now-1)
      .setExpirationTime(options.expiresAt ?? now+30*86400).sign(options.key ?? privateKey);
  }
  return { team, aud, jwk, privateKey, kid, mint, token: await mint(), secondToken: await mint({ email: TESTER_B, subject: 'synthetic-owner-b' }) };
}
