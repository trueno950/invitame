import type { IncomingMessage } from "node:http";

import { MAX_ALT_LENGTH } from "../domain/media-asset";

// A strict multipart reader for the one upload route (M8 S4). The API registers no multipart parser today, and the
// upload needs exact bounds instead of a library default: the body is read up to `maxBytes` (413 past it), only the
// named fields are accepted (any other field is a 400), exactly one file part is accepted, and a repeated field is
// refused rather than silently overwritten. Nothing is written before the whole body is validated.

/** The fields the upload route accepts, next to the file part. */
const ALLOWED_FIELDS = ["kind", "alt"] as const;
/** One file plus its two fields; more parts than this are refused before they are parsed. */
const MAX_PARTS = 5;

/** A multipart refusal, with the status the route answers and a stable code. */
export class MultipartFormError extends Error {
  constructor(
    readonly status: 400 | 413 | 415,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MultipartFormError";
  }
}

/** One uploaded file part: the bytes and, for a diagnostic only, the client's own names. */
export interface MultipartFile {
  bytes: Buffer;
  filename: string | null;
  contentType: string | null;
}

/** The validated form of one upload request. */
export interface MultipartUpload {
  file: MultipartFile;
  fields: Map<string, string>;
}

/**
 * Reads and validates one multipart upload. The client's `Content-Type` of the file part and its filename are
 * recorded but never trusted: the application decides the format from the bytes.
 */
export async function readMultipartUpload(
  request: IncomingMessage,
  options: { maxBytes: number },
): Promise<MultipartUpload> {
  const boundary = boundaryOf(request.headers["content-type"]);
  const body = await readBody(request, options.maxBytes);
  const parts = splitParts(body, boundary);

  if (parts.length > MAX_PARTS) {
    throw invalid("The form has too many parts.");
  }

  const fields = new Map<string, string>();
  let file: MultipartFile | null = null;

  for (const part of parts) {
    const { headers, content } = parsePart(part);
    const disposition = parseDisposition(headers["content-disposition"]);
    if (disposition === null) {
      throw invalid("Every part must be a form field.");
    }

    if (disposition.name === "file") {
      if (file !== null) {
        throw invalid("Only one file may be uploaded.");
      }
      file = {
        bytes: content,
        filename: disposition.filename,
        contentType: headers["content-type"] ?? null,
      };
      continue;
    }

    if (!(ALLOWED_FIELDS as readonly string[]).includes(disposition.name)) {
      throw invalid("The form has an unexpected field.");
    }
    if (fields.has(disposition.name)) {
      throw invalid("The form repeats a field.");
    }
    if (disposition.filename !== null) {
      throw invalid("A text field must not be a file.");
    }
    const value = content.toString("utf8");
    if (value.length > 2048) {
      throw invalid("A form field is too long.");
    }
    fields.set(disposition.name, value);
  }

  if (file === null) {
    throw invalid("A file must be uploaded.");
  }

  return { file, fields };
}

function invalid(message: string): MultipartFormError {
  return new MultipartFormError(400, "INVALID_MEDIA_UPLOAD", message);
}

/** The boundary of a `multipart/form-data` request; anything else is a 415 before the body is read. */
function boundaryOf(contentType: string | undefined): string {
  if (typeof contentType !== "string") {
    throw new MultipartFormError(415, "UNSUPPORTED_MEDIA_TYPE", "A multipart upload is required.");
  }

  const [type, ...parameters] = contentType.split(";").map((part) => part.trim());
  if (type?.toLowerCase() !== "multipart/form-data") {
    throw new MultipartFormError(415, "UNSUPPORTED_MEDIA_TYPE", "A multipart upload is required.");
  }

  for (const parameter of parameters) {
    const separator = parameter.indexOf("=");
    if (separator === -1) {
      continue;
    }
    if (parameter.slice(0, separator).trim().toLowerCase() !== "boundary") {
      continue;
    }
    const boundary = parameter
      .slice(separator + 1)
      .trim()
      .replace(/^"|"$/g, "");
    if (boundary.length === 0 || boundary.length > 200) {
      break;
    }
    return boundary;
  }

  throw invalid("The multipart boundary is missing.");
}

/** Reads the raw body, refusing one byte over the route's limit (413) without buffering past it. */
async function readBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    total += bytes.length;
    if (total > maxBytes) {
      throw new MultipartFormError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
    }
    chunks.push(bytes);
  }

  return Buffer.concat(chunks);
}

/** Splits the body on its boundary delimiters; a malformed or truncated body is a 400. */
function splitParts(body: Buffer, boundary: string): Buffer[] {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts: Buffer[] = [];
  let cursor = body.indexOf(delimiter);

  if (cursor !== 0) {
    throw invalid("The multipart body is malformed.");
  }

  while (cursor !== -1) {
    const start = cursor + delimiter.length;
    if (body.subarray(start, start + 2).equals(Buffer.from("--"))) {
      return parts;
    }
    if (!body.subarray(start, start + 2).equals(Buffer.from("\r\n"))) {
      throw invalid("The multipart body is malformed.");
    }

    const contentStart = start + 2;
    const next = body.indexOf(Buffer.from(`\r\n--${boundary}`), contentStart);
    if (next === -1) {
      throw invalid("The multipart body is malformed.");
    }
    parts.push(body.subarray(contentStart, next));
    cursor = next + 2;
  }

  throw invalid("The multipart body is malformed.");
}

/** One part split into its lower-cased headers and its content. */
function parsePart(part: Buffer): {
  headers: Record<string, string>;
  content: Buffer;
} {
  const separator = part.indexOf(Buffer.from("\r\n\r\n"));
  if (separator === -1) {
    throw invalid("A multipart part is malformed.");
  }

  const headers: Record<string, string> = {};
  for (const line of part.subarray(0, separator).toString("utf8").split("\r\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) {
      continue;
    }
    headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }

  return { headers, content: part.subarray(separator + 4) };
}

/** The `name` and optional `filename` of a `Content-Disposition` header, or null when it names no field. */
function parseDisposition(
  header: string | undefined,
): { name: string; filename: string | null } | null {
  if (typeof header !== "string") {
    return null;
  }

  const name = /(?:^|;)\s*name="([^"]*)"/i.exec(header)?.[1];
  if (name === undefined || name.length === 0) {
    return null;
  }
  const filename = /(?:^|;)\s*filename="([^"]*)"/i.exec(header)?.[1] ?? null;

  return { name, filename };
}

/** The alt-text bound of the form's own field, shared with the documented upload contract. */
export const FORM_ALT_MAX_LENGTH = MAX_ALT_LENGTH;
