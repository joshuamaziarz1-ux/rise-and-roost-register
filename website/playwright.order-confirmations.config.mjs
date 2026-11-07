import base from './playwright.config.mjs';
export default {...base,testMatch:/order-confirmation\.spec\.mjs/,webServer:undefined,reporter:[['list']],outputDir:'qa-results/order-confirmations'};
