import { Failure } from "../_shared/social-drive.ts";
export const appId = "1756532002112953";
export const configId = "2271522993798663";
export const callback =
  "https://workspace.karmawebs.com/social/instagram/callback";
const graph = "https://graph.facebook.com/v27.0";
const required = ["instagram_basic", "instagram_content_publish"];
export function loginURL(state: string) {
  const url = new URL("https://www.facebook.com/dialog/oauth");
  url.search = new URLSearchParams({
    client_id: appId,
    config_id: configId,
    redirect_uri: callback,
    response_type: "code",
    override_default_response_type: "true",
    display: "popup",
    state,
  }).toString();
  return url.toString();
}
async function graphRequest(path: string, init: RequestInit) {
  const response = await fetch(graph + path, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  if (!response.ok || body.error)
    throw new Failure(
      body.error?.code === 190 ? "REAUTHORIZE" : "META_UNAVAILABLE",
      409,
    );
  return body;
}
export async function identity(token: string, secret: string) {
  const headers = { Authorization: "Bearer " + token };
  // Batch keeps the debug_token input out of the HTTP URL and server request logs.
  const batch = await graphRequest("/", {
    method: "POST",
    headers: { Authorization: "Bearer " + appId + "|" + secret },
    body: new URLSearchParams({
      batch: JSON.stringify([
        {
          method: "GET",
          relative_url:
            "debug_token?" + new URLSearchParams({ input_token: token }),
        },
      ]),
    }),
  });
  if (batch[0]?.code !== 200) throw new Failure("META_UNAVAILABLE", 502);
  const info = JSON.parse(batch[0].body).data;
  if (!info?.is_valid || String(info.app_id) !== appId)
    throw new Failure("REAUTHORIZE", 409);
  const scopes: string[] = info.scopes ?? [];
  if (!required.every((s) => scopes.includes(s)))
    throw new Failure("INCOMPLETE_CONSENT", 409);
  if (
    scopes.some(
      (s) =>
        ![...required, "instagram_manage_messages", "public_profile"].includes(
          s,
        ),
    )
  )
    throw new Failure("UNEXPECTED_PERMISSIONS", 409);
  const [business, accounts] = await Promise.all([
    graphRequest("/me?fields=client_business_id", { headers }),
    graphRequest("/me/assigned_instagram_accounts?fields=id,username&limit=2", {
      headers,
    }),
  ]);
  if (
    !business.client_business_id ||
    accounts.data?.length !== 1 ||
    accounts.paging?.next
  )
    throw new Failure("SELECT_ONE_ACCOUNT", 409);
  const account = accounts.data[0];
  if (!account.id || !account.username)
    throw new Failure("INCOMPLETE_CONSENT", 409);
  const deadlines = [info.expires_at, info.data_access_expires_at].filter(
    (n) => typeof n === "number" && n > 0,
  );
  const expires = deadlines.length
    ? new Date(Math.min(...deadlines) * 1000)
    : null;
  if (expires && expires.getTime() <= Date.now())
    throw new Failure("REAUTHORIZE", 409);
  return {
    external: String(account.id),
    username: String(account.username),
    business: String(business.client_business_id),
    scopes,
    expires: expires?.toISOString() ?? null,
  };
}
export async function exchange(code: string, secret: string) {
  const data = await graphRequest("/oauth/access_token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: appId,
      client_secret: secret,
      redirect_uri: callback,
      code,
    }),
  });
  if (typeof data.access_token !== "string" || !data.access_token)
    throw new Failure("INVALID_CALLBACK", 400);
  return data.access_token as string;
}
