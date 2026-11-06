import base from './playwright.config.mjs';
export default { ...base, testMatch: 'management.spec.mjs', webServer: undefined, reporter: [['list']], outputDir: './qa-results/navigation-regression', projects: base.projects.filter(p => ['desktop-chromium', 'iphone-webkit'].includes(p.name)) };
