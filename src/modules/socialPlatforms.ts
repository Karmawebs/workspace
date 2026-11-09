export const platforms = {
  instagram: { name: "Instagram", availability: "next_stage" },
  facebook: { name: "Facebook", availability: "planned" },
  tiktok: { name: "TikTok", availability: "planned" },
} as const;
export type Platform = keyof typeof platforms;
export type ConnectionStatus =
  "connected" | "reauthorization_required" | "disconnected";
export type SocialAccount = {
  id: string;
  project_id: string;
  platform: Platform;
  external_account_id: string;
  username: string;
  status: ConnectionStatus;
  expires_at: string | null;
  connected_at: string;
  authorized_scopes: string[];
};
export function accountState(account: SocialAccount, now = Date.now()) {
  if (account.status === "disconnected") return "Desconectada";
  if (account.status === "reauthorization_required")
    return "Requiere autorización";
  if (account.expires_at && Date.parse(account.expires_at) <= now)
    return "Autorización caducada";
  return "Conectada";
}
