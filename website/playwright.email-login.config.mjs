import base from "./playwright.config.mjs";
export default {
  ...base,
  testMatch: /email-login\.spec\.mjs/,
  webServer: undefined,
  reporter: [["list"]],
  outputDir: "qa-results/email-login",
};
