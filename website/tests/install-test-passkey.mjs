// Test-only authenticator. Never included in public assets or the Worker.
import { softwarePasskey } from './passkey-fixture.mjs';
export async function installTestPasskey(page, info, origin) {
    if (info.project.name.includes('chromium')) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('WebAuthn.enable');
      await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
      info.annotations.push({ type: 'passkey', description: 'Chromium native WebAuthn with virtual CTAP2 authenticator' });
    } else {
      // WebKit has no virtual-authenticator API. A signing software authenticator
      // exercises the same frontend ceremony + real server cryptographic checks.
      // This does not claim to test macOS/iOS biometric prompts.
      const key = softwarePasskey();
      await page.exposeFunction('__qaPasskey', (options, register) => register ? key.register(options, origin) : key.login(options, origin));
      await page.addInitScript(() => {
        // This Linux WebKit build has no OS authenticator implementation.
        // Supply only the test interface; the server still checks every signature.
        if (!window.PublicKeyCredential) window.PublicKeyCredential = class PublicKeyCredential {};
        if (!navigator.credentials) Object.defineProperty(navigator, 'credentials', { value: {} });
        const b64 = value => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const buf = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)).buffer;
        const perform = async ({ publicKey }, register) => {
          const options = { ...publicKey, challenge: b64(publicKey.challenge), ...(publicKey.user ? { user: { ...publicKey.user, id: b64(publicKey.user.id) } } : {}) };
          const result = await window.__qaPasskey(options, register), response = Object.fromEntries(Object.entries(result.response).map(([k,v]) => [k, ['clientDataJSON', 'attestationObject', 'authenticatorData', 'signature', 'userHandle'].includes(k) && v ? buf(v) : v]));
          response.getTransports = () => ['internal'];
          return { ...result, rawId: buf(result.rawId), response, getClientExtensionResults: () => ({}) };
        };
        Object.defineProperty(navigator.credentials, 'create', { value: options => perform(options, true) });
        Object.defineProperty(navigator.credentials, 'get', { value: options => perform(options, false) });
      });
      info.annotations.push({ type: 'passkey', description: 'WebKit signing software authenticator; physical Touch ID remains manual' });
    }
  }
