import base from './playwright.config.mjs';
export default {...base,testMatch:/contact-login\.spec\.mjs/,webServer:undefined,reporter:[['list']],outputDir:'qa-results/contact-login'};
