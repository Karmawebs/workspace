// Read bounded ranges of the signed original. The video payload (mdat) never enters memory.
import { geometryError } from "../_shared/instagram-formats.ts";
import { Rejection } from "./worker.ts";
const invalid = () =>
  new Rejection("No se pudo validar la cabecera del archivo multimedia.");
const name = (b: Uint8Array, p: number) =>
  String.fromCharCode(...b.subarray(p, p + 4));
function uint(b: Uint8Array, p: number) {
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(p);
}
function jpeg(b: Uint8Array) {
  if (b[0] !== 255 || b[1] !== 216) throw invalid();
  for (let p = 2; p + 8 < b.length;) {
    if (b[p++] !== 255) throw invalid();
    while (b[p] === 255) p++;
    const marker = b[p++],
      len = (b[p] << 8) + b[p + 1];
    if ([192, 193, 194].includes(marker))
      return {
        width: (b[p + 5] << 8) + b[p + 6],
        height: (b[p + 3] << 8) + b[p + 4],
      };
    if (len < 2) throw invalid();
    p += len;
  }
  throw invalid();
}
function boxes(bytes: Uint8Array, type: string) {
  const result: Uint8Array[] = [];
  for (let i = 0; i + 8 <= bytes.length;) {
    const n = uint(bytes, i);
    if (n < 8 || i + n > bytes.length) throw invalid();
    if (name(bytes, i + 4) === type) result.push(bytes.subarray(i + 8, i + n));
    i += n;
  }
  return result;
}
function movie(format: string, moov: Uint8Array) {
  for (const track of boxes(moov, "trak")) {
    const mdia = boxes(track, "mdia")[0];
    if (!mdia || !boxes(mdia, "hdlr").some((b) => name(b, 8) === "vide"))
      continue;
    const tkhd = boxes(track, "tkhd")[0],
      mdhd = boxes(mdia, "mdhd")[0];
    if (!tkhd || !mdhd) throw invalid();
    const w = uint(tkhd, tkhd.length - 8) / 65536,
      h = uint(tkhd, tkhd.length - 4) / 65536;
    const v1 = mdhd[0] === 1,
      scale = uint(mdhd, v1 ? 20 : 12);
    const duration = v1
      ? uint(mdhd, 24) * 2 ** 32 + uint(mdhd, 28)
      : uint(mdhd, 16);
    const msg = geometryError(format, true, w, h, duration / scale);
    if (msg) throw new Rejection(msg);
    const minf = boxes(mdia, "minf")[0],
      stbl = minf && boxes(minf, "stbl")[0],
      stsd = stbl && boxes(stbl, "stsd")[0];
    if (!stsd || !["avc1", "avc3", "hvc1", "hev1"].includes(name(stsd, 12)))
      throw new Rejection("El vídeo requiere H.264 o HEVC.");
    return;
  }
  throw invalid();
}
export async function inspectOriginal(
  format: string,
  file: { mime_type: string; size: number },
  read: (offset: number, length: number) => Promise<Uint8Array>,
) {
  if (file.mime_type === "image/jpeg") {
    const { width, height } = jpeg(
      await read(0, Math.min(file.size, 512 * 1024)),
    );
    const msg = geometryError(format, false, width, height, 0);
    if (msg) throw new Rejection(msg);
    return;
  }
  for (let offset = 0, i = 0; i < 64 && offset + 8 <= file.size; i++) {
    const head = await read(offset, Math.min(16, file.size - offset));
    let size = uint(head, 0),
      header = 8;
    if (size === 1) {
      size = uint(head, 8) * 2 ** 32 + uint(head, 12);
      header = 16;
    }
    if (
      !Number.isSafeInteger(size) ||
      size < header ||
      offset + size > file.size
    )
      throw invalid();
    if (name(head, 4) === "moov") {
      if (size > 4 * 1024 * 1024)
        throw new Rejection(
          "La cabecera del vídeo es demasiado grande para validarla.",
        );
      movie(format, await read(offset + header, size - header));
      return;
    }
    offset += size;
  }
  throw invalid();
}
export async function readRange(
  url: string,
  start: number,
  length: number,
  total: number,
) {
  const r = await fetch(url, {
    headers: { Range: "bytes=" + start + "-" + (start + length - 1) },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (
    !(
      r.status === 206 ||
      (r.status === 200 && start === 0 && length === total)
    ) ||
    Number(r.headers.get("content-length")) !== length
  ) {
    await r.body?.cancel();
    throw invalid();
  }
  return new Uint8Array(await r.arrayBuffer());
}
