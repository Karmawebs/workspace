declare module "word-extractor/lib/buffer-reader.js" {
  export default class BufferReader {
    constructor(buffer: import("buffer").Buffer);
  }
}
declare module "word-extractor/lib/word-ole-extractor.js" {
  export default class WordOleExtractor {
    extract(reader: import("word-extractor/lib/buffer-reader.js").default): Promise<{ getBody(): string }>;
  }
}
declare module "process" {
  const process: unknown;
  export default process;
}
