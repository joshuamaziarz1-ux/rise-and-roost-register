import base from './playwright.config.mjs';
const origin = process.env.RR_EXPERIENCE_PREVIEW_URL;
if (origin !== 'https://rise-roost-experience-preview.joshua-maziarz1.workers.dev')
  throw new Error('Hosted experience tests require the exact separate preview Worker.');
export default {
  ...base,
  testDir: './tests/experience-browser',
  webServer: undefined,
  use: { ...base.use, baseURL: origin, trace: 'off' },
};
