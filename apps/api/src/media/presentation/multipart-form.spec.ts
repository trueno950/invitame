import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { describe, it } from "node:test";

import { detectImageFormat, MEDIA_FORMAT_ISSUE } from "../domain/media-asset";
import { MultipartFormError, readMultipartUpload } from "./multipart-form";

// The strict multipart reader of the one upload route (M8 S4). The body is read up to an exact bound, the parts are
// only the documented ones, and a malformed or truncated body is refused before anything is stored: a browser can
// send any shape, so every edge of the format is a case here. The client's filename and MIME are recorded and never
// trusted — the bytes decide the format.

const BOUNDARY = "----invitameTestBoundary";

/** One part of a form the test builds. */
interface Part {
  name?: string;
  value?: string;
  filename?: string;
  contentType?: string;
  bytes?: Buffer;
  /** Raw text written instead of a well-formed part, for the malformed cases. */
  raw?: string;
}

/** A multipart body built exactly as a browser writes one. */
function form(parts: Part[], boundary = BOUNDARY): Buffer {
  const chunks: Buffer[] = [];

  for (const part of parts) {
    if (part.raw !== undefined) {
      chunks.push(Buffer.from(part.raw));
      continue;
    }
    const filename = part.filename === undefined ? "" : `; filename="${part.filename}"`;
    const contentType =
      part.contentType === undefined ? "" : `\r\nContent-Type: ${part.contentType}`;
    const disposition =
      part.name === undefined
        ? "Content-Disposition: form-data"
        : `Content-Disposition: form-data; name="${part.name}"`;
    chunks.push(Buffer.from(`--${boundary}\r\n${disposition}${filename}${contentType}\r\n\r\n`));
    chunks.push(part.bytes ?? Buffer.from(part.value ?? ""));
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return Buffer.concat(chunks);
}

/** A request stream over the given chunks, with the headers a real upload carries; null sends none at all. */
function request(
  body: Buffer | readonly Buffer[],
  contentType: string | null = `multipart/form-data; boundary=${BOUNDARY}`,
): IncomingMessage {
  const chunks = Buffer.isBuffer(body) ? [body] : [...body];
  const stream = Readable.from(chunks) as unknown as IncomingMessage;

  Object.assign(stream, {
    headers: contentType === null ? {} : { "content-type": contentType },
  });

  return stream;
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

/** The refusal one request gets, asserted by status and code and nothing else. */
async function refusal(
  stream: IncomingMessage,
  options: { maxBytes: number } = { maxBytes: 1024 * 1024 },
): Promise<MultipartFormError> {
  try {
    await readMultipartUpload(stream, options);
  } catch (error) {
    assert.ok(error instanceof MultipartFormError, "every refusal is a MultipartFormError");
    return error;
  }

  throw new Error("the reader accepted a request it had to refuse");
}

describe("multipart upload reader (M8 S4)", () => {
  it("reads the file part and the documented fields", async () => {
    const body = form([
      { name: "kind", value: "gallery" },
      { name: "alt", value: "Entrada" },
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", bytes: JPEG },
    ]);

    const upload = await readMultipartUpload(request(body), { maxBytes: 1024 * 1024 });

    assert.equal(upload.fields.get("kind"), "gallery");
    assert.equal(upload.fields.get("alt"), "Entrada");
    assert.deepEqual(upload.file.bytes, JPEG);
    assert.equal(upload.file.filename, "photo.jpg");
    assert.equal(detectImageFormat(upload.file.bytes), "jpeg");
  });

  it("refuses an unknown field with 400 and stores nothing", async () => {
    const body = form([
      { name: "kind", value: "gallery" },
      { name: "position", value: "3" },
      { name: "file", filename: "photo.jpg", bytes: JPEG },
    ]);

    const error = await refusal(request(body));

    assert.equal(error.status, 400);
    assert.equal(error.code, "INVALID_MEDIA_UPLOAD");
  });

  it("refuses a repeated field instead of keeping the last value", async () => {
    const body = form([
      { name: "kind", value: "gallery" },
      { name: "kind", value: "main-photo" },
      { name: "file", filename: "photo.jpg", bytes: JPEG },
    ]);

    const error = await refusal(request(body));

    assert.equal(error.status, 400);
    assert.equal(error.code, "INVALID_MEDIA_UPLOAD");
  });

  it("refuses two file parts, a text field sent as a file, and a form with no file", async () => {
    const twoFiles = form([
      { name: "kind", value: "gallery" },
      { name: "file", filename: "one.jpg", bytes: JPEG },
      { name: "file", filename: "two.jpg", bytes: JPEG },
    ]);
    assert.equal((await refusal(request(twoFiles))).status, 400);

    const textAsFile = form([
      { name: "kind", filename: "kind.txt", bytes: Buffer.from("gallery") },
      { name: "file", filename: "photo.jpg", bytes: JPEG },
    ]);
    assert.equal((await refusal(request(textAsFile))).status, 400);

    const noFile = form([{ name: "kind", value: "gallery" }]);
    assert.equal((await refusal(request(noFile))).status, 400);
  });

  it("refuses a malformed, a truncated, and an unlabelled body with 400", async () => {
    // A body that does not start with its boundary delimiter.
    const malformed = Buffer.concat([
      Buffer.from("Content-Disposition: form-data\r\n\r\n"),
      form([]),
    ]);
    assert.equal((await refusal(request(malformed))).status, 400);

    // A body cut off before its closing delimiter.
    const complete = form([{ name: "file", filename: "photo.jpg", bytes: JPEG }]);
    const truncated = complete.subarray(0, complete.length - 12);
    assert.equal((await refusal(request(truncated))).status, 400);

    // A part with no header block at all.
    const headerless = form([{ raw: `--${BOUNDARY}\r\n--${BOUNDARY}--\r\n` }]);
    assert.equal((await refusal(request(headerless))).status, 400);
  });

  it("refuses a multipart request without a boundary, and any other content type, with 415", async () => {
    const boundaryless = form([{ name: "file", filename: "photo.jpg", bytes: JPEG }]);

    const missing = await refusal(request(boundaryless, "multipart/form-data"));
    assert.equal(missing.status, 400);
    assert.equal(missing.code, "INVALID_MEDIA_UPLOAD");

    const json = await refusal(
      request(Buffer.from(JSON.stringify({ kind: "gallery" })), "application/json"),
    );
    assert.equal(json.status, 415);
    assert.equal(json.code, "UNSUPPORTED_MEDIA_TYPE");

    const noType = await refusal(request(boundaryless, null));
    assert.equal(noType.status, 415);
    assert.equal(noType.code, "UNSUPPORTED_MEDIA_TYPE");
  });

  it("refuses a streamed body one chunk past the bound with 413, buffering only a few chunks", async () => {
    // 500 chunks of 1 KB against a 4 KB bound: the reader must stop reading instead of buffering the whole body.
    const chunk = Buffer.alloc(1024, 0x2a);
    let consumed = 0;

    async function* body(): AsyncGenerator<Buffer> {
      for (let index = 0; index < 500; index += 1) {
        consumed += 1;
        yield chunk;
      }
    }

    const stream = Readable.from(body()) as unknown as IncomingMessage;
    Object.assign(stream, {
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    });

    const error = await refusal(stream, { maxBytes: 4096 });

    assert.equal(error.status, 413);
    assert.equal(error.code, "PAYLOAD_TOO_LARGE");
    assert.ok(consumed <= 6, `the reader consumed ${consumed} chunks of 500`);
  });

  it("accepts a JPEG whatever the client calls it, because the bytes decide", async () => {
    // A browser can send any filename and any part MIME; the reader records them and the domain reads the bytes.
    const body = form([
      { name: "kind", value: "main-photo" },
      { name: "file", filename: "evil.html", contentType: "text/html", bytes: JPEG },
    ]);

    const upload = await readMultipartUpload(request(body), { maxBytes: 1024 * 1024 });

    assert.equal(upload.file.filename, "evil.html");
    assert.equal(upload.file.contentType, "text/html");
    assert.equal(detectImageFormat(upload.file.bytes), "jpeg", MEDIA_FORMAT_ISSUE);
  });
});
