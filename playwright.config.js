import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'tests/browser',fullyParallel:false,workers:1,timeout:60000,
 snapshotPathTemplate:'{testDir}/../../test-results/baselines/{projectName}/{arg}{ext}',
 use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure'},
 projects:[{name:'chromium',use:{...devices['Desktop Chrome']}},{name:'iphone-webkit',use:{...devices['iPhone 13']}},{name:'android-chromium',use:{...devices['Pixel 7']}},{name:'tablet-landscape',testMatch:'layout.spec.js',use:{...devices['Desktop Chrome'],viewport:{width:1180,height:820},hasTouch:true}}],
 webServer:{command:'node tests/server.mjs',url:'http://127.0.0.1:4173/register-v5.html',reuseExistingServer:false,timeout:60000}
});
