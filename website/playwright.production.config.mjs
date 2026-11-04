import base from './playwright.config.mjs';
export default { ...base, testDir: './tests/production-browser', outputDir: './qa-results/production-traces', reporter: [['list']], webServer: undefined,
  projects: base.projects.filter(p => ['desktop-chromium', 'iphone-webkit'].includes(p.name)) };
