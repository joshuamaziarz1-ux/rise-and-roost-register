import base from './playwright.config.mjs';
export default { ...base, use: { ...base.use, ignoreHTTPSErrors: true }, testMatch: /customer-email\.spec\.mjs/, webServer: undefined, reporter: [['list']], outputDir: './qa-results/customer-email' };
