import base from './playwright.config.mjs';
export default {...base,testMatch:'return-credits.spec.mjs',webServer:undefined,reporter:[['list']],outputDir:'./qa-results/return-credits-traces'};
