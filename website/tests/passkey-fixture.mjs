// A real signing authenticator for API tests; never shipped to the browser/Worker.
import { generateKeyPairSync, randomBytes, createHash, sign } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';
const digest = value => createHash('sha256').update(value).digest();
const encoded = value => Buffer.from(value).toString('base64url');
export function softwarePasskey() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' }), id = randomBytes(32);
  let counter = 0, userHandle;
  const common = response => ({ id: encoded(id), rawId: encoded(id), type: 'public-key', response, clientExtensionResults: {}, authenticatorAttachment: 'platform' });
  return {
    register(options, origin, { verified = true } = {}) {
      userHandle = options.user.id;
      const client = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin, crossOrigin: false }));
      const cose = isoCBOR.encode(new Map([[1, 2], [3, -7], [-1, 1], [-2, new Uint8Array(Buffer.from(jwk.x, 'base64url'))], [-3, new Uint8Array(Buffer.from(jwk.y, 'base64url'))]]));
      const length = Buffer.alloc(2); length.writeUInt16BE(id.length);
      const authData = Buffer.concat([digest(options.rp.id), Buffer.from([verified ? 0x45 : 0x41]), Buffer.alloc(4), Buffer.alloc(16), length, id, Buffer.from(cose)]);
      const attestation = isoCBOR.encode(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', new Uint8Array(authData)]]));
      return common({ clientDataJSON: encoded(client), attestationObject: encoded(attestation), transports: ['internal'] });
    },
    login(options, origin, { verified = true } = {}) {
      const client = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin, crossOrigin: false }));
      const count = Buffer.alloc(4); count.writeUInt32BE(++counter);
      const authData = Buffer.concat([digest(options.rpId), Buffer.from([verified ? 5 : 1]), count]);
      const signature = sign('sha256', Buffer.concat([authData, digest(client)]), privateKey);
      return common({ clientDataJSON: encoded(client), authenticatorData: encoded(authData), signature: encoded(signature), userHandle });
    },
  };
}
