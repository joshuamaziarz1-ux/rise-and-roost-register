import base from './playwright.config.mjs';
export default { ...base, testMatch: /(?:checkout-pickup|return-credits|roost-login|customer|navigation|help|phase3|calendar-history)\.spec\.mjs/, webServer: undefined, reporter: [['list']], outputDir: './qa-results/cash-regressions' };
