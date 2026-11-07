import base from './playwright.config.mjs';
export default {...base,testMatch:/password-login\.spec\.mjs/,webServer:undefined,reporter:[['list']],outputDir:'qa-results/password-login'};
