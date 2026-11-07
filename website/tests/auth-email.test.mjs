import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { sqliteD1 } from "../server/sqlite-adapter.mjs";
import {
  sendAuthEmail,
  authSendingReady,
  authEmail,
  normalizeEmail,
} from "../server/auth-email.mjs";
const workspace = "a".repeat(48),
  email = "owner@example.test";
const env = {
  RESEND_API_KEY: "mock",
  PUBLIC_WORKSPACE_ID: workspace,
  DEPLOYMENT_ENVIRONMENT: "production",
  ROOST_AUTH_FREE_PLAN_CONFIRMED: "true",
  ROOST_AUTH_OWNER_TEST: "true",
  PRODUCTION_OWNERS: JSON.stringify([{ role: "owner", email }]),
};
test("auth email sending is explicitly gated and owner-only testing cannot send to customers", async () => {
  assert.equal(authSendingReady({}, email), false);
  assert.equal(authSendingReady(env, email), true);
  assert.equal(authSendingReady(env, "customer@example.test"), false);
  assert.equal(
    authSendingReady(
      { ...env, ROOST_AUTH_FREE_PLAN_CONFIRMED: "false" },
      email,
    ),
    false,
  );
  assert.equal(
    normalizeEmail(" Neighbor@Example.test "),
    "neighbor@example.test",
  );
  assert.throws(() => normalizeEmail("bad@address"));
  for (const k of ["verify", "reset", "password", "changed"]) {
    const m = authEmail(
      k,
      email,
      "https://rise-and-roost.com/roost#auth=verify." + "a".repeat(48),
    );
    assert.equal(m.from, "Rise & Roost <orders@rise-and-roost.com>");
    assert.ok(m.text);
    assert.ok(m.html);
  }
});
test("Resend failures return pending safely, controls stay independent of disabled order email and share free-plan budget", async () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  const db = sqliteD1(sql);
  let attempts = 0;
  const send = async () => {
    attempts++;
    return Response.json({ error: "provider detail" }, { status: 429 });
  };
  assert.equal(
    await sendAuthEmail(
      db,
      {},
      workspace,
      Date.now(),
      "verify",
      email,
      "b".repeat(48),
      send,
    ),
    false,
  );
  assert.equal(attempts, 0);
  assert.equal(
    await sendAuthEmail(
      db,
      { ...env, ORDER_EMAIL_ENABLED: "false" },
      workspace,
      Date.now(),
      "verify",
      email,
      "b".repeat(48),
      send,
    ),
    false,
  );
  assert.equal(attempts, 1);
  assert.equal(
    await sendAuthEmail(
      db,
      env,
      workspace,
      Date.now(),
      "reset",
      email,
      "b".repeat(48),
      async () => {
        throw Error("network");
      },
    ),
    false,
  );
  assert.equal(
    await sendAuthEmail(
      db,
      env,
      workspace,
      Date.now(),
      "verify",
      email,
      "b".repeat(48),
      async (url, o) => {
        assert.equal(url, "https://api.resend.com/emails");
        assert.ok(o.signal);
        assert.equal(o.redirect, "manual");
        return Response.json({ id: "synthetic" });
      },
    ),
    true,
  );
});
