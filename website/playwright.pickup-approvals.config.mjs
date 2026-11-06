import base from './playwright.config.mjs';
export default { ...base, testMatch: 'pickup-approvals.spec.mjs', webServer: undefined, reporter: [['list']], outputDir: './qa-results/pickup-approvals-traces' };
