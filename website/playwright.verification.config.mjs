import base from './playwright.config.mjs';
export default { ...base, testMatch: /email-login\.spec\.mjs/, webServer: undefined, reporter: [['list']], projects: base.projects.filter(p => ['desktop-chromium', 'desktop-webkit', 'iphone-webkit'].includes(p.name)) };
