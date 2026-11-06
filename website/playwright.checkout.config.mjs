import base from './playwright.config.mjs';
// Every mutation uses a disposable local production Worker/SQLite fixture.
export default { ...base, testMatch: 'checkout-pickup.spec.mjs', webServer: undefined,
  reporter: [['list']], outputDir: './qa-results/checkout' };
