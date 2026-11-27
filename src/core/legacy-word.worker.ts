// Older binary .doc files can contain malformed sector chains. Read them in
// a disposable worker so a bad file never blocks the task editor.
import { Buffer } from "buffer";
import process from "process";

Object.assign(globalThis, { Buffer, process, global: globalThis });

self.onmessage = async ({ data }: MessageEvent<ArrayBuffer>) => {
  try {
    const { default: WordOleExtractor } = await import("word-extractor/lib/word-ole-extractor.js");
    const { default: BufferReader } = await import("word-extractor/lib/buffer-reader.js");
    const buffer = Buffer.from(data);
    if (buffer.length < 512 || buffer.readUInt32BE(0) !== 0xd0cf11e0) throw new Error("Formato DOC no reconocido");
    const document = await new WordOleExtractor().extract(new BufferReader(buffer));
    self.postMessage({ text: document.getBody() });
  } catch {
    self.postMessage({ error: true });
  }
};
