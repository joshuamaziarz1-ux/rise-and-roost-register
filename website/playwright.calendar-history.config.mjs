import base from './playwright.config.mjs';
export default { ...base, testMatch: 'calendar-history.spec.mjs', webServer: undefined, reporter: [['list']], outputDir: './qa-results/calendar-history-traces' };
