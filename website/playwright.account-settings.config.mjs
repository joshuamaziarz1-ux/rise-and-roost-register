import base from './playwright.config.mjs';
export default { ...base, testMatch: /account-settings\.spec\.mjs/, webServer: undefined, reporter: [['list']], outputDir: './qa-results/account-settings-traces' };
