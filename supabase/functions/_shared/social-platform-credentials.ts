// Server-only key ring. The future connector supplies the key for the envelope's version.
type Tokens = { accessToken: string; refreshToken?: string };
type Envelope = { key_version: number; ciphertext: string };
const encode = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
function decode(hex: string) {
  if (!/^(?:[\da-f]{2})+$/i.test(hex))
    throw new Error("Invalid credential envelope");
  return Uint8Array.from(hex.match(/../g)!, (value) => parseInt(value, 16));
}
function parameters(
  connectionId: string,
  version: number,
  iv: Uint8Array<ArrayBuffer>,
) {
  return {
    name: "AES-GCM",
    iv,
    additionalData: new TextEncoder().encode(
      `social-platform:${connectionId}:${version}`,
    ),
  };
}
export async function sealPlatformTokens(
  connectionId: string,
  tokens: Tokens,
  key: CryptoKey,
  version: number,
): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    parameters(connectionId, version, iv),
    key,
    new TextEncoder().encode(JSON.stringify(tokens)),
  );
  return {
    key_version: version,
    ciphertext: encode(iv) + "." + encode(new Uint8Array(encrypted)),
  };
}
export async function openPlatformTokens(
  connectionId: string,
  envelope: Envelope,
  key: CryptoKey,
): Promise<Tokens> {
  const [iv, data] = envelope.ciphertext.split(".");
  const bytes = await crypto.subtle.decrypt(
    parameters(connectionId, envelope.key_version, decode(iv)),
    key,
    decode(data),
  );
  return JSON.parse(new TextDecoder().decode(bytes));
}
