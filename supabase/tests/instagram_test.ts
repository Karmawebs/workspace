import assert from "node:assert/strict";
import {
  identity,
  exchange,
  loginURL,
  appId,
  configId,
  callback,
} from "../functions/social-instagram/meta.ts";
Deno.test(
  "Unified Login uses configuration, verifies SUAT and resolves exactly one professional account",
  async () => {
    const u = new URL(loginURL("nonce"));
    assert.equal(u.searchParams.get("config_id"), configId);
    assert.equal(u.searchParams.get("redirect_uri"), callback);
    assert.equal(u.searchParams.get("state"), "nonce");
    assert.equal(u.searchParams.has("scope"), false);
    const info = {
      is_valid: true,
      app_id: appId,
      scopes: [
        "instagram_basic",
        "instagram_content_publish",
        "instagram_manage_messages",
      ],
      expires_at: 0,
    };
    const accounts = [{ id: "123", username: "fixture" }];
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input)).pathname;
      assert.ok(!String(input).includes("fixture-token"));
      const json = (v: unknown) => Response.json(v);
      if (path.endsWith("/oauth/access_token")) {
        assert.equal(
          new URLSearchParams(String(init?.body)).get("code"),
          "fixture-code",
        );
        return json({ access_token: "fixture-token" });
      }
      if (path.endsWith("/me/assigned_instagram_accounts"))
        return json({ data: accounts });
      if (path.endsWith("/me")) return json({ client_business_id: "42" });
      return json([{ code: 200, body: JSON.stringify({ data: info }) }]);
    };
    try {
      const t = await exchange("fixture-code", "secret");
      assert.equal((await identity(t, "secret")).username, "fixture");
      assert.equal((await identity(t, "secret")).expires, null);
      accounts.push({ id: "456", username: "another" });
      await assert.rejects(identity(t, "secret"), /SELECT_ONE_ACCOUNT/);
      accounts.pop();
      info.scopes.push("ads_read");
      await assert.rejects(identity(t, "secret"), /UNEXPECTED_PERMISSIONS/);
      info.scopes.pop();
      info.scopes = ["instagram_basic"];
      await assert.rejects(identity(t, "secret"), /INCOMPLETE_CONSENT/);
      info.is_valid = false;
      await assert.rejects(identity(t, "secret"), /REAUTHORIZE/);
    } finally {
      globalThis.fetch = original;
    }
  },
);
