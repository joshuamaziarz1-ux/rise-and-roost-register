import { defineConfig,devices } from '@playwright/test';
const origin='https://rise-roost-experience-preview.joshua-maziarz1.workers.dev';
if(process.env.RR_PIN_PREVIEW_URL!==origin)throw Error('Exact isolated PIN preview required.');
export default defineConfig({testDir:'./tests/pin-hosted-browser',workers:1,timeout:45000,reporter:'list',use:{baseURL:origin,trace:'off'},projects:[{name:'desktop-chromium',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}},{name:'desktop-webkit',use:{...devices['Desktop Safari']}},{name:'iphone-webkit',use:{...devices['iPhone 13']}},{name:'android-chromium',use:{...devices['Pixel 7']}},{name:'tablet-chromium',use:{...devices['Desktop Chrome'],viewport:{width:1180,height:820}}}]});
