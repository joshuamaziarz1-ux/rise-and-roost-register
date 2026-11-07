import base from './playwright.config.mjs';
export default { ...base, testMatch: /(?:roost-entry|roost-login|customer|return-credits|cash-pickup|pickup-approvals|checkout)\.spec\.mjs/, webServer: undefined, reporter: [['list']], outputDir: './qa-results/roost-entry-traces' };
