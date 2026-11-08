import {
  passwordLogin,
  passwordVerifier,
  validatePassword,
  constantEqual,
} from "./password-login.mjs";
import {
  customerSession,
  customerCookie,
  sessionStatements,
  sessionHash as hash,
  sessionToken as token,
  RECENT_AUTH,
} from "./customer-sessions.mjs";
import {
  emailLoginReady,
  emailOwnerTestReady,
  normalizeEmail,
  sendAuthEmail,
} from "./auth-email.mjs";
import { authorizedTestRecipient } from './email-policy.mjs';
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const first = (db, sql, ...args) =>
  db
    .prepare(sql)
    .bind(...args)
    .first();
const scheme = "pbkdf2-sha256-100000-192-hmac-v1";
const neutral = {
  ok: true,
  message:
    "If an account exists with that email address, we’ll send a password reset link.",
};
async function limit(db, key, max, now, window = 3600000) {
  const r = await first(
    db,
    "INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    await hash("email-auth:" + key + ":" + Math.floor(now / window)),
    now + window * 2,
  );
  if (r.count > max) fail("Too many attempts. Please try again later.", 429);
}
async function replacement(password, env) {
  validatePassword(password);
  const salt = token();
  return {
    salt,
    verifier: await passwordVerifier(password, salt, env.ROOST_PASSWORD_PEPPER),
    scheme,
  };
}
export async function emailLogin({
  request,
  db,
  workspaceId: w,
  now,
  input,
  path,
  response,
  env,
  send = sendAuthEmail,
}) {
  if (!emailLoginReady(env) && !emailOwnerTestReady(env))
    fail(
      "Email sign-in is being prepared. Please use Existing member sign-in for now.",
      503,
    );
  const a = path.split("/").at(-1),
    ip = request.headers.get("CF-Connecting-IP") || "local";
  const ownerOnly = env.ROOST_AUTH_OWNER_TEST === 'true';
  if (ownerOnly && !['verify','reset'].includes(a) && !authorizedTestRecipient(env, input.email))
    fail('Email sign-in is available only for the authorized owner test.', 503);
  await limit(db, "ip:" + ip, 50, now);
  await limit(db, "global", 1000, now);
  const member = await customerSession(request, db, w, now);
  if (a === "recover") {
    const email = normalizeEmail(input.email);
    await limit(db, "recovery:" + w + ":" + email, 5, now);
    const saved = await first(
      db,
      "SELECT p.username FROM roost_email_identities e JOIN roost_passwords p ON p.workspace_id=e.workspace_id AND p.member_id=e.member_id WHERE e.workspace_id=? AND e.email=?",
      w,
      email,
    );
    if (input.password !== input.confirmPassword)
      fail("The passwords do not match.");
    const result = await passwordLogin({
      request,
      db,
      workspaceId: w,
      now,
      input: {
        username: saved?.username || "missing-account",
        password: input.password,
        recoveryKey: input.recoveryKey,
      },
      path: "/api/roost/password/recover",
      response,
      env,
    });
    await send(db, env, w, now, "password", email);
    return result;
  }

  if (["register", "resend", "forgot", "link", "login"].includes(a)) {
    const email = normalizeEmail(input.email);
    await limit(db, "identity:" + w + ":" + email, 10, now, 900000);
    const identity = await first(
      db,
      "SELECT * FROM roost_email_identities WHERE workspace_id=? AND email=?",
      w,
      email,
    );
    if (a === "login") {
      const row =
        identity &&
        (await first(
          db,
          "SELECT * FROM roost_passwords WHERE workspace_id=? AND member_id=?",
          w,
          identity.member_id,
        ));
      const valid =
        row?.scheme === scheme &&
        /^[a-f0-9]{48}$/.test(row.salt) &&
        /^[a-f0-9]{64}$/.test(row.verifier);
      if (typeof input.password !== "string" || input.password.length > 512)
        fail("The email or password does not match.", 401);
      const result = await passwordVerifier(
        input.password,
        valid ? row.salt : "00".repeat(24),
        env.ROOST_PASSWORD_PEPPER,
      );
      if (!valid || !constantEqual(result, row.verifier))
        fail("The email or password does not match.", 401);
      const claim = token(),
        session = token(),
        guard = "EXISTS(SELECT 1 FROM roost_password_grants WHERE id=?)";
      const batch = [
        db
          .prepare(
            "INSERT INTO roost_password_grants(id,expires) SELECT ?,? WHERE EXISTS(SELECT 1 FROM roost_email_identities e JOIN roost_passwords p ON p.workspace_id=e.workspace_id AND p.member_id=e.member_id WHERE e.workspace_id=? AND e.email=? AND p.verifier=? AND p.revision=?)",
          )
          .bind(claim, now + 300000, w, email, row.verifier, row.revision),
      ];
      if (member)
        batch.push(
          db
            .prepare(
              "UPDATE roost_sessions SET expires=0 WHERE hash=? AND " + guard,
            )
            .bind(member.session_hash, claim),
        );
      batch.push(
        ...sessionStatements(
          db,
          request,
          w,
          row.member_id,
          { hash: await hash(session) },
          now,
          guard,
          [claim],
        ),
      );
      batch.push(
        db
          .prepare(
            "INSERT INTO roost_auth_events(id,workspace_id,member_id,event,occurred_at) SELECT ?,?,?,?,? WHERE " +
              guard,
          )
          .bind(token(), w, row.member_id, "email_login", now, claim),
      );
      const r = await db.batch(batch);
      if (!r[0].meta.changes) fail("Please sign in again.", 409);
      return response({ ok: true }, [
        customerCookie(request, w, session, 30 * 86400),
      ]);
    }
    let purpose = a === "forgot" ? "reset" : a === "link" ? "link" : "register",
      id = null,
      payload = {},
      sessionHash = null;
    if (a === "forgot") {
      if (!identity) return response(neutral);
      id = identity.member_id;
      const pwd = await first(
        db,
        "SELECT revision FROM roost_passwords WHERE workspace_id=? AND member_id=?",
        w,
        id,
      );
      if (!pwd) return response(neutral);
      payload = { revision: pwd.revision };
    } else if (a === "link") {
      if (!member || member.authenticated_at + RECENT_AUTH <= now)
        fail(
          "Sign in again to your existing account before verifying an email.",
          401,
        );
      const pwd = await first(
        db,
        "SELECT * FROM roost_passwords WHERE workspace_id=? AND member_id=?",
        w,
        member.id,
      );
      if (pwd) {
        if (
          typeof input.currentPassword !== "string" ||
          input.currentPassword.length > 512 ||
          !constantEqual(
            await passwordVerifier(
              input.currentPassword,
              pwd.salt,
              env.ROOST_PASSWORD_PEPPER,
            ),
            pwd.verifier,
          )
        )
          fail(
            "Enter your current password to change your sign-in email.",
            401,
          );
      } else payload = await replacement(input.password, env);
      if (identity && identity.member_id !== member.id)
        fail(
          "This email cannot be linked. Use another address or contact us for help.",
          409,
        );
      id = member.id;
      sessionHash = member.session_hash;
      payload = {
        ...payload,
        revision: pwd?.revision ?? null,
        oldEmail:
          (
            await first(
              db,
              "SELECT email FROM roost_email_identities WHERE workspace_id=? AND member_id=?",
              w,
              id,
            )
          )?.email || null,
      };
    } else {
      if (member)
        fail("Use Account Settings to verify an email for this account.", 409);
      if (a === "resend") {
        // A password is required: an attacker cannot replace another pending registrant's password.
        const pending = await first(
          db,
          "SELECT * FROM roost_email_tokens WHERE workspace_id=? AND email=? AND purpose='register' AND claimed_by IS NULL ORDER BY expires DESC LIMIT 1",
          w,
          email,
        );
        if (!pending)
          return response({
            ok: true,
            pending: true,
            message:
              "If registration is pending, we’ll send a verification email. Email delivery may be temporarily unavailable.",
          });
        payload = JSON.parse(pending.payload_json);
        if (
          typeof input.password !== "string" ||
          input.password.length > 512 ||
          !constantEqual(
            await passwordVerifier(
              input.password,
              payload.salt,
              env.ROOST_PASSWORD_PEPPER,
            ),
            payload.verifier,
          )
        )
          return response({ ok: true, pending: true });
      } else {
        const name = typeof input.name === "string" ? input.name.trim() : "";
        if (!name || name.length > 80 || /[\x00-\x1f]/.test(name))
          fail("Enter your full name, up to 80 characters.");
        payload = { ...(await replacement(input.password, env)), name };
      }
      // Prevent duplicate identities, but never attach or merge on a claimed profile email.
      if (
        identity ||
        (await first(
          db,
          "SELECT id FROM roost_members WHERE workspace_id=? AND lower(trim(json_extract(profile_json,'$.email')))=?",
          w,
          email,
        ))
      )
        return response({
          ok: true,
          pending: true,
          message:
            "Existing members should use Existing member sign-in, then verify their email in Account Settings. Check your email if registration is pending, or use Sign In or Forgot Password.",
        });
    }
    const matching = purpose === "register" && await first(db,
      "SELECT expires FROM roost_email_tokens WHERE workspace_id=? AND email=? AND purpose='register' AND claimed_by IS NULL ORDER BY expires DESC LIMIT 1", w, email);
    if (a === "resend" && matching && matching.expires > now + 840000)
      return response({ ok: true, pending: true, message: "A verification email was just sent. Open the latest email; check Spam before requesting another." });
    await limit(db, "send-ip:" + ip, 10, now);
    await limit(db, "send:" + w + ":" + email, 3, now);
    const secret = token(),
      digest = await hash(secret);
    await db.batch([
      db
        .prepare("DELETE FROM roost_email_tokens WHERE expires<?")
        .bind(now - 86400000),
      db
        .prepare(
          "INSERT INTO roost_email_tokens(hash,workspace_id,email,purpose,member_id,session_hash,payload_json,expires) VALUES(?,?,?,?,?,?,?,?)",
        )
        .bind(
          digest,
          w,
          email,
          purpose,
          id,
          sessionHash,
          JSON.stringify(payload),
          now + 900000,
        ),
    ]);
    const sent = await send(
      db,
      env,
      w,
      now,
      purpose === "reset" ? "reset" : "verify",
      email,
      secret,
    );
    if (!sent)
      await db
        .prepare("UPDATE roost_email_tokens SET expires=? WHERE hash=?")
        .bind(now, digest)
        .run();
    return response(
      a === "forgot"
        ? neutral
        : {
            ok: true,
            pending: true,
            message: sent
              ? "Check your email for a verification link."
              : "Your email still needs verification. Email delivery is temporarily unavailable. Please try again later.",
          },
      [],
    );
  }
  if (
    !["verify", "reset"].includes(a) ||
    !/^[a-f0-9]{48}$/.test(input.token || "")
  )
    fail(
      "This verification link is invalid. Open the complete link from your email.",
      401,
    );
  const row = await first(
    db,
    "SELECT * FROM roost_email_tokens WHERE hash=? AND workspace_id=?",
    await hash(input.token),
    w,
  );
  if (!row || (a === "reset") !== (row.purpose === "reset"))
    fail(
      "This verification link is invalid. Open the complete link from your email.",
      401,
    );
  if (ownerOnly && !authorizedTestRecipient(env, row.email)) fail('This email test is restricted to an owner.', 503);
  // The mailbox token verifies a new account across browsers; it never creates a session.
  // Existing-account email linking still requires the recent authenticated session below.
  if (row.claimed_by)
    fail(a === "verify" ? "This link was already used successfully. Your email is verified. Select Sign In." : "This password reset link was already used. Request a new reset link.", 401);
  if (row.expires <= now)
    fail("This verification link has expired. Request a new email using your email and password.", 401);
  if (row.purpose === "register" && await first(db, "SELECT 1 FROM roost_email_identities WHERE workspace_id=? AND email=?", w, row.email))
    fail("Your email is already verified. Select Sign In.", 401);
  const p = JSON.parse(row.payload_json),
    claim = token(),
    id = row.member_id || token();
  if (
    row.purpose === "link" &&
    (!member ||
      member.id !== id ||
      member.session_hash !== row.session_hash ||
      member.authenticated_at + RECENT_AUTH <= now)
  )
    fail(
      "Open this link in the browser where you requested it, and sign in again if needed.",
      401,
    );
  let condition = "1",
    args = [];
  if (row.purpose === "register") {
    condition =
      "NOT EXISTS(SELECT 1 FROM roost_email_identities WHERE workspace_id=? AND email=?) AND NOT EXISTS(SELECT 1 FROM roost_members WHERE workspace_id=? AND lower(trim(json_extract(profile_json,'$.email')))=?) AND (SELECT COUNT(*) FROM roost_members WHERE workspace_id=?)<500";
    args = [w, row.email, w, row.email, w];
  } else {
    condition =
      "EXISTS(SELECT 1 FROM roost_passwords WHERE workspace_id=? AND member_id=? AND revision=?)";
    args = [w, id, p.revision];
    if (row.purpose === "link" && p.revision === null) {
      condition =
        "NOT EXISTS(SELECT 1 FROM roost_passwords WHERE workspace_id=? AND member_id=?)";
      args = [w, id];
    }
    if (row.purpose === "reset") {
      condition +=
        " AND EXISTS(SELECT 1 FROM roost_email_identities WHERE workspace_id=? AND email=? AND member_id=?)";
      args.push(w, row.email, id);
    } else {
      condition +=
        " AND EXISTS(SELECT 1 FROM roost_sessions s JOIN roost_session_details d ON d.hash=s.hash WHERE s.hash=? AND s.workspace_id=? AND s.member_id=? AND s.expires>? AND d.absolute_expires>? AND d.authenticated_at>?) AND NOT EXISTS(SELECT 1 FROM roost_email_identities WHERE workspace_id=? AND email=? AND member_id<>?)";
      args.push(
        row.session_hash,
        w,
        id,
        now,
        now,
        now - RECENT_AUTH,
        w,
        row.email,
        id,
      );
    }
  }
  const guard =
      "EXISTS(SELECT 1 FROM roost_email_tokens WHERE hash=? AND claimed_by=?)",
    g = [row.hash, claim];
  const b = [
    db
      .prepare(
        "UPDATE roost_email_tokens SET claimed_by=? WHERE hash=? AND claimed_by IS NULL AND expires>? AND " +
          condition,
      )
      .bind(claim, row.hash, now, ...args),
  ];
  if (row.purpose === "register")
    b.push(
      db
        .prepare(
          "INSERT INTO roost_members(id,workspace_id,profile_json,recovery_hash,created_at) SELECT ?,?,?,?,? WHERE " +
            guard,
        )
        .bind(
          id,
          w,
          JSON.stringify({ name: p.name, email: row.email, phone: "" }),
          await hash(token()),
          now,
          ...g,
        ),
    );
  if (
    row.purpose === "register" ||
    (row.purpose === "link" && p.revision === null)
  )
    b.push(
      db
        .prepare(
          "INSERT INTO roost_passwords(workspace_id,username,member_id,salt,verifier,scheme) SELECT ?,?,?,?,?,? WHERE " +
            guard,
        )
        .bind(w, "e-" + id.slice(0, 28), id, p.salt, p.verifier, scheme, ...g),
    );
  if (a === "reset") {
    const next = await replacement(input.password, env);
    if (input.password !== input.confirmPassword)
      fail("The passwords do not match.");
    b.push(
      db
        .prepare(
          "UPDATE roost_passwords SET salt=?,verifier=?,revision=revision+1 WHERE workspace_id=? AND member_id=? AND " +
            guard,
        )
        .bind(next.salt, next.verifier, w, id, ...g),
    );
  } else
    b.push(
      db
        .prepare(
          "INSERT INTO roost_email_identities(workspace_id,email,member_id,verified_at) SELECT ?,?,?,? WHERE " +
            guard +
            " ON CONFLICT(workspace_id,member_id) DO UPDATE SET email=excluded.email,verified_at=excluded.verified_at",
        )
        .bind(w, row.email, id, now, ...g),
    );
  if (row.purpose !== "register") {
    b.push(
      db
        .prepare(
          "UPDATE roost_sessions SET expires=0 WHERE workspace_id=? AND member_id=? AND " +
            guard,
        )
        .bind(w, id, ...g),
    );
    b.push(
      db
        .prepare(
          "UPDATE roost_challenges SET expires=0 WHERE workspace_id=? AND json_extract(data_json,'$.id')=? AND " +
            guard,
        )
        .bind(w, id, ...g),
    );
  }
  b.push(
    db
      .prepare(
        "UPDATE roost_email_tokens SET expires=0 WHERE workspace_id=? AND (member_id=? OR email=?) AND hash<>? AND " +
          guard,
      )
      .bind(w, id, row.email, row.hash, ...g),
  );
  b.push(
    db
      .prepare(
        "INSERT INTO roost_auth_events(id,workspace_id,member_id,event,occurred_at) SELECT ?,?,?,?,? WHERE " +
          guard,
      )
      .bind(
        token(),
        w,
        id,
        a === "reset"
          ? "password_reset"
          : row.purpose === "link"
            ? "email_linked"
            : "email_verified",
        now,
        ...g,
      ),
  );
  const r = await db.batch(b);
  if (r[0].meta.changes !== 1)
    fail(
      "This link is no longer available. Please start again from Sign In.",
      409,
    );
  if (a === "reset") await send(db, env, w, now, "password", row.email);
  if (row.purpose === "link" && p.oldEmail && p.oldEmail !== row.email)
    await send(db, env, w, now, "changed", p.oldEmail);
  return response(
    {
      ok: true,
      message:
        a === "reset"
          ? "Your password is saved. Please sign in."
          : "Email Verified Successfully. Please sign in with your email and password.",
    },
    row.purpose === "link" ? [customerCookie(request, w, "", 0)] : [],
  );
}
