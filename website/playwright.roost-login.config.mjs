import base from './playwright.config.mjs';
export default { ...base, testMatch: /(?:roost-login|customer)\.spec\.mjs/, webServer: undefined, reporter: [['list']], outputDir: './qa-results/roost-login' };
