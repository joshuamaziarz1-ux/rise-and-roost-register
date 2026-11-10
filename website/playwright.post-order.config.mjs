import base from './playwright.config.mjs';
export default { ...base, testDir: './tests/post-order-browser', webServer: undefined,
  reporter: [['list']], outputDir: './qa-results/post-order' };
