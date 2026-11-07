// Native workerd/D1 smoke; every provider request is intercepted in-process.
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import assert from "node:assert/strict";
import { seed } from '../public/model.mjs';
import { PRODUCTION_DATABASE_ID, PRODUCTION_WORKSPACE_ID } from '../server/production-preparation.mjs';
const bundle = process.env.RR_PRODUCTION_WORKER_BUNDLE;
if (!bundle) throw Error("Provide a dry-run bundle.");
const messages = [];
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    modulesRoot: dirname(bundle),
    rootPath: dirname(bundle),
    scriptPath: bundle,
    compatibilityDate: "2025-10-01",
    cf: false,
    d1Databases: ["DB"],
    serviceBindings: { ASSETS: () => new Response("synthetic") },
    bindings: {
      CUSTOMER_EXPERIENCE_ENABLED: "true",
      REVIEW_BUILD: "false",
      DEPLOYMENT_ENVIRONMENT: "production",
      PRODUCTION_RELEASE_APPROVED: "true",
      PRODUCTION_DATABASE_ID,
      PUBLIC_WORKSPACE_ID: PRODUCTION_WORKSPACE_ID,
      STUDIO_MANAGEMENT_ENABLED: "true",
      COMMERCE_UPDATE_ENABLED: "true",
      REAL_CHECKOUT_ENABLED: "false",
      ORDER_EMAIL_ENABLED: "false",
      PRODUCTION_ACCESS_TEAM_DOMAIN: "https://synthetic.cloudflareaccess.com",
      PRODUCTION_ACCESS_AUD: "a".repeat(64),
      PRODUCTION_OWNERS: JSON.stringify([{email:'owner@example.test',name:'Synthetic Owner',role:'owner'}]),
      ROOST_EMAIL_LOGIN_ENABLED: "true",
      ROOST_PASSWORD_LOGIN_ENABLED: "true",
      ROOST_PASSWORD_PEPPER: "synthetic".repeat(8),
      RESEND_API_KEY: "mock",
      ROOST_AUTH_EMAIL_ENABLED: "true",
      ROOST_AUTH_DELIVERY_VERIFIED: "true",
      ROOST_AUTH_FREE_PLAN_CONFIRMED: "true",
      WEBSITE_BASE_URL: "https://rise-and-roost.com",
    },
    outboundService: async (req) => {
      assert.equal(req.url, "https://api.resend.com/emails");
      messages.push(await req.json());
      return Response.json({ id: "mock" });
    },
  }),
);
try {
  const db = await mf.getD1Database("DB");
  const schema = (
    await readFile(new URL("../schema.sql", import.meta.url), "utf8")
  )
    .split("\n")
    .filter((x) => !x.trim().startsWith("--"))
    .join("\n");
  for (const sql of schema.split(";"))
    if (sql.trim()) await db.prepare(sql).run();
  const identitySchema=await readFile(new URL('../production-identity.sql',import.meta.url),'utf8');
  await db.prepare(identitySchema).run();
  await db.prepare("INSERT INTO deployment_identity VALUES('main','production',?,?)").bind(PRODUCTION_DATABASE_ID,PRODUCTION_WORKSPACE_ID).run();
  const document=JSON.stringify(seed());
  await db.prepare('INSERT INTO workspaces(id,owner_hash,draft_json,published_json,versions_json,created_at) VALUES(?,?,?,?,?,?)').bind(PRODUCTION_WORKSPACE_ID,'disabled-legacy-owner',document,document,'[]',new Date().toISOString()).run();
  const origin = "https://rise-and-roost.com",
    cookies = new Map(),
    password = "a friendly garden phrase",
    email = "neighbor@example.test";
  async function call(path, body) {
    const r = await mf.dispatchFetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: [...cookies].map(([k, v]) => k + "=" + v).join("; "),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const c of r.headers.getSetCookie()) {
      const [k, v] = c.split(";")[0].split("=");
      if (c.includes("Max-Age=0")) cookies.delete(k);
      else cookies.set(k, v);
    }
    return { status: r.status, data: await r.json() };
  }
  const workspaceId = PRODUCTION_WORKSPACE_ID;
  const post = (p, b = {}) => call("/api/roost/" + p, { workspaceId, ...b });
  const me = () => call("/api/roost/me?workspace=" + workspaceId);
  assert.equal(
    (await post("email/register", { name: "Neighbor", email, password }))
      .status,
    200,
  );
  assert.equal((await me()).data.member, null);
  const verify = messages.at(-1).text.match(/#auth=verify\.([a-f0-9]{48})/)[1];
  assert.equal((await post("email/verify", { token: verify })).status, 200);
  assert.equal((await post("email/verify", { token: verify })).status, 401);
  assert.equal((await post("email/login", { email, password })).status, 200);
  const id = (await me()).data.member.id;
  assert.equal((await post("email/forgot", { email })).status, 200);
  const reset = messages.at(-1).text.match(/#auth=reset\.([a-f0-9]{48})/)[1];
  const next = "a different friendly garden phrase";
  assert.equal(
    (
      await post("email/reset", {
        token: reset,
        password: next,
        confirmPassword: next,
      })
    ).status,
    200,
  );
  assert.equal((await me()).data.member, null);
  assert.equal(
    (
      await post("email/reset", {
        token: reset,
        password: next,
        confirmPassword: next,
      })
    ).status,
    401,
  );
  assert.equal(
    (await post("email/login", { email, password: next })).status,
    200,
  );
  assert.equal((await me()).data.member.id, id);
  assert.equal(messages.at(-1).subject, "Password Changed · Rise & Roost");
  assert.equal((await call('/studio/api/manage/snapshot')).status,401);
  assert.equal((await call('/api/manage/snapshot')).status,404);
  const closedCheckout=await call('/api/orders',{});
  assert.equal(closedCheckout.status,409);
  assert.match(closedCheckout.data.error,/Ordering is not open yet/);
  console.log(
    JSON.stringify({
      actualWorkerdD1: true,
      productionWrapper: true,
      studioProtected: true,
      checkoutDisabled: true,
      pendingRegistration: true,
      singleUseVerification: true,
      emailLogin: true,
      singleUseReset: true,
      sessionInvalidation: true,
      memberPreserved: true,
      mockedResend: true,
      remoteRequests: 0,
    }),
  );
} finally {
  await mf.dispose();
}
