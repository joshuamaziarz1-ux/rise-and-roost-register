import base from './playwright.config.mjs';
const origin = process.env.RR_MANAGEMENT_PREVIEW_URL;
if (origin !== 'https://rise-roost-experience-preview.joshua-maziarz1.workers.dev')
  throw new Error('Hosted Studio checks require the exact isolated experience preview.');
export default {
  ...base,
  testMatch: '**/management.spec.mjs',
  grepInvert: /visually unchanged/,
  webServer: undefined,
  use: { ...base.use, baseURL: origin, trace: 'off' },
};
