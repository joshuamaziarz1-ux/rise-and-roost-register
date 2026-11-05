import base from './playwright.config.mjs';
export default { ...base, testMatch: 'help.spec.mjs', webServer: undefined, reporter: [['list']], outputDir: './qa-results/help' };
