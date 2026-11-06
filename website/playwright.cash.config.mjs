import base from './playwright.config.mjs';
export default { ...base, testMatch: 'cash-pickup.spec.mjs', webServer: undefined, reporter: [['list']], outputDir: './qa-results/cash-traces' };
