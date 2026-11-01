import base from './playwright.config.mjs';
export default { ...base, testDir:'./tests/commerce-browser', outputDir:'./qa-results/commerce-traces', reporter:[['list']], webServer:undefined, projects:base.projects.filter(p=>['desktop-chromium','iphone-webkit'].includes(p.name)) };
