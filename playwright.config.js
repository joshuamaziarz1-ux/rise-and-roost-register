import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'tests/browser',fullyParallel:false,workers:1,timeout:30000,
 use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure'},
 projects:[{name:'chromium',use:{...devices['Desktop Chrome']}},{name:'iphone-webkit',use:{...devices['iPhone 13']}},{name:'android-chromium',use:{...devices['Pixel 7']}}],
 webServer:{command:'node tests/server.mjs',url:'http://127.0.0.1:4173/register-v5.html',reuseExistingServer:false,timeout:60000}
});
