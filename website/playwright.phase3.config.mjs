import base from './playwright.config.mjs';

// Every case owns a disposable SQLite-backed local server. No hosted URL is used.
export default {
  ...base,
  testMatch: 'phase3.spec.mjs',
  webServer: undefined,
  reporter: [['list']],
  outputDir: './qa-results/phase3-traces',
  projects: base.projects.filter(project => ['desktop-chromium', 'iphone-webkit'].includes(project.name)),
};
