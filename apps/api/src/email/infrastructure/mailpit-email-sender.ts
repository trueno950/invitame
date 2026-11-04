import type { EmailMessage, EmailSender } from "../application/email-sender.port";
import {
  discardBody,
  EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
  failureForStatus,
  postJson,
} from "./http-email-request";

const NAMED_ADDRESS_PATTERN = /^([^<>]*)<([^<>]+)>$/;

export interface MailpitEmailSenderOptions {
  /** Mailpit origin, for example `http://localhost:8025`. */
  baseUrl: string;
  from: string;
  timeoutMs?: number;
}

interface MailpitAddress {
  Name?: string;
  Email: string;
}

function toMailpitAddress(value: string): MailpitAddress {
  const match = NAMED_ADDRESS_PATTERN.exec(value);
  const name = match?.[1]?.trim();
  const email = match?.[2]?.trim();

  if (!email) {
    return { Email: value };
  }

  return name ? { Name: name, Email: email } : { Email: email };
}

/**
 * Local development adapter for the Mailpit mail catcher's HTTP send API (`POST /api/v1/send`, JSON
 * `From`/`To`/`Subject`/`Text`/`HTML`/`Headers`; 200 `{ "ID" }` or 400 `{ "Error" }`). Mailpit has no
 * idempotency, so the key travels as an `X-Idempotency-Key` header to make retries visible in the UI.
 * Sources: https://mailpit.axllent.org/docs/api-v1/ and `server/apiv1/send.go` plus
 * `swaggerParams.go` at tag v1.33.0 (checked 2026-11-04).
 */
export class MailpitEmailSender implements EmailSender {
  readonly endpoint: string;
  readonly #from: MailpitAddress;
  readonly #timeoutMs: number;

  constructor(options: MailpitEmailSenderOptions) {
    this.endpoint = `${options.baseUrl}/api/v1/send`;
    this.#from = toMailpitAddress(options.from);
    this.#timeoutMs = options.timeoutMs ?? EMAIL_PROVIDER_REQUEST_TIMEOUT_MS;
  }

  async send(message: EmailMessage): Promise<void> {
    const response = await postJson(
      this.endpoint,
      {},
      {
        From: this.#from,
        To: [{ Email: message.to }],
        Subject: message.subject,
        Text: message.text,
        ...(message.html === undefined ? {} : { HTML: message.html }),
        Headers: { "X-Idempotency-Key": message.idempotencyKey },
      },
      this.#timeoutMs,
    );

    await discardBody(response);

    if (!response.ok) {
      throw failureForStatus(response.status);
    }
  }
}
