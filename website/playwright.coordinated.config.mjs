import base from './playwright.config.mjs';
export default {...base,testMatch:/coordinated-release\.spec\.mjs/,webServer:undefined,reporter:[['list']],outputDir:'qa-results/coordinated'};
