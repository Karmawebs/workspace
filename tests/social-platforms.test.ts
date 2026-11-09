import { expect, it } from "vitest";
import {
  accountState,
  type SocialAccount,
} from "../src/modules/socialPlatforms";
it("prioritizes disconnection and reauthorization and detects expiry at its boundary", () => {
  const row: SocialAccount = {
    id: "1",
    project_id: "p",
    platform: "instagram",
    external_account_id: "a",
    username: "test",
    status: "connected",
    authorized_scopes: [],
    connected_at: "2026-01-01",
    expires_at: "2026-02-01",
  };
  const expires = Date.parse(row.expires_at!);
  expect(accountState(row, expires - 1)).toBe("Conectada");
  expect(accountState(row, expires)).toBe("Autorización caducada");
  expect(
    accountState({ ...row, status: "reauthorization_required" }, expires),
  ).toBe("Requiere autorización");
  expect(accountState({ ...row, status: "disconnected" }, expires)).toBe(
    "Desconectada",
  );
});
