import {
  SENDER,
  emailAddress,
  authorizedTestRecipient,
} from "./email-policy.mjs";
import { reserveEmailBudget } from "./notifications.mjs";
export const emailLoginReady = (env) =>
  env.ROOST_EMAIL_LOGIN_ENABLED === "true" &&
  env.ROOST_PASSWORD_LOGIN_ENABLED === "true" &&
  typeof env.ROOST_PASSWORD_PEPPER === "string" &&
  env.ROOST_PASSWORD_PEPPER.length >= 32;
export function normalizeEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!emailAddress(email))
    throw Object.assign(new Error("Enter a valid email address."), {
      status: 400,
    });
  return email;
}
export const authSendingReady = (env, email) =>
  !!env.RESEND_API_KEY &&
  env.ROOST_AUTH_FREE_PLAN_CONFIRMED === "true" &&
  ((env.ROOST_AUTH_EMAIL_ENABLED === "true" &&
    env.ROOST_AUTH_DELIVERY_VERIFIED === "true") ||
    (env.ROOST_AUTH_OWNER_TEST === "true" &&
      authorizedTestRecipient(env, email)));
export function authEmail(kind, email, url) {
  const titles = {
    verify: "Verify Your Email",
    reset: "Reset Your Password",
    password: "Password Changed",
    changed: "Email Address Changed",
  };
  const title = titles[kind];
  const message =
    kind === "verify"
      ? "Welcome to The Roost. Confirm your email to finish joining our little community."
      : kind === "reset"
        ? "Choose a new password for your Roost account."
        : kind === "password"
          ? "Your Roost password was changed. If this was not you, contact Rise & Roost right away."
          : "The verified email for your Roost account was changed. If this was not you, contact Rise & Roost right away.";
  // Only server-generated, fixed-origin URLs containing hex tokens reach this template.
  const action = url
    ? `<p><a style="display:inline-block;padding:16px 24px;background:#52694e;color:white;border-radius:8px" href="${url}">${title}</a></p><p>This link expires in 15 minutes and works once. If you did not request it, ignore this email.</p>`
    : "";
  return {
    from: SENDER,
    to: [email],
    subject: title + " · Rise & Roost",
    text: `${title}\n\n${message}\n\n${url ? url + "\nThis link expires in 15 minutes and works once. If you did not request it, ignore this email." : ""}\n\nRise & Roost`,
    html: `<html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#faf6ed;color:#293d2c;font:17px/1.6 Georgia,serif"><main style="max-width:560px;margin:auto;padding:32px 20px"><p>RISE & ROOST</p><h1>${title}</h1><p>${message}</p>${action}<p>From our little store to your table.</p></main></body></html>`,
  };
}
export async function sendAuthEmail(
  db,
  env,
  workspace,
  now,
  kind,
  email,
  secret,
  fetcher = fetch,
) {
  if (!authSendingReady(env, email)) return false;
  if (!(await reserveEmailBudget(db, workspace, now))) return false; // shared conservative free-plan allowance
  const origin =
    env.DEPLOYMENT_ENVIRONMENT === "production"
      ? "https://rise-and-roost.com"
      : env.WEBSITE_BASE_URL;
  if (!origin || !/^https?:\/\/[a-z0-9.:-]+$/i.test(origin)) return false;
  const url = secret ? origin + "/roost#auth=" + kind + "." + secret : "";
  try {
    const r = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": "roost-auth-" + crypto.randomUUID(),
      },
      body: JSON.stringify(authEmail(kind, email, url)),
    });
    return r.ok && !!(await r.json()).id;
  } catch {
    return false;
  } // never log recipient, provider body, password, or token
}
