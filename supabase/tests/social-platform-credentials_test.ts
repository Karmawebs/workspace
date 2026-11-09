import assert from "node:assert/strict";
import {
  openPlatformTokens,
  sealPlatformTokens,
} from "../functions/_shared/social-platform-credentials.ts";
Deno.test(
  "envelopes bind account identity and key version and use a fresh IV",
  async () => {
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const tokens = { accessToken: "example", refreshToken: "test" };
    const first = await sealPlatformTokens("A", tokens, key, 1);
    assert.deepEqual(await openPlatformTokens("A", first, key), tokens);
    assert.notEqual(
      first.ciphertext,
      (await sealPlatformTokens("A", tokens, key, 1)).ciphertext,
    );
    await assert.rejects(openPlatformTokens("B", first, key));
    await assert.rejects(
      openPlatformTokens("A", { ...first, key_version: 2 }, key),
    );
  },
);
