import base from './playwright.config.mjs';
export default {...base,testMatch:/resend-email\.spec\.mjs/,webServer:undefined,reporter:[['list']],outputDir:'qa-results/email-traces'};
