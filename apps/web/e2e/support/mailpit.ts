import { expect } from "@playwright/test";

import { requireLocalUrl } from "./environment.ts";

/**
 * Reads the sign-in emails the API delivered through its existing `mailpit` provider (S38). The code
 * reaches a test only here, through Mailpit's HTTP API (`GET /api/v1/search` and
 * `GET /api/v1/message/{ID}`, v1.33.0); the API exposes no code through any endpoint, flag, or log.
 */

const CODE_PATTERN = /Código de acceso a InvitaMe: (\d{6})/;
/** The API answers before delivery (S24), so a message can arrive shortly after the page updates. */
const DELIVERY_TIMEOUT_MS = 15_000;

interface MailpitAddress {
  Address: string;
}

interface MailpitSummary {
  ID: string;
  To: MailpitAddress[];
}

interface MailpitMessage {
  ID: string;
  To: MailpitAddress[];
  Subject: string;
  Text: string;
}

export interface SignInEmail {
  recipients: string[];
  subject: string;
  code: string;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(new URL(path, requireLocalUrl("E2E_MAILPIT_URL")));

  if (!response.ok) {
    throw new Error(
      `Mailpit answered ${response.status} for ${new URL(path, "http://x").pathname}.`,
    );
  }

  return (await response.json()) as T;
}

/** Every message whose recipients include `email` exactly, oldest first. */
async function messagesTo(email: string): Promise<MailpitSummary[]> {
  const query = new URLSearchParams({ query: `to:"${email}"` });
  const result = await getJson<{ messages: MailpitSummary[] }>(`/api/v1/search?${query}`);
  return result.messages
    .filter((message) => message.To.some((to) => to.Address === email))
    .reverse();
}

async function readSignInEmail(id: string): Promise<SignInEmail> {
  const message = await getJson<MailpitMessage>(`/api/v1/message/${encodeURIComponent(id)}`);
  const code = CODE_PATTERN.exec(message.Text)?.[1];

  if (!code) {
    throw new Error("The message carries no sign-in code.");
  }

  return {
    recipients: message.To.map((to) => to.Address),
    subject: message.Subject,
    code,
  };
}

/**
 * Waits until exactly `count` messages addressed to `email` exist and returns them, oldest first.
 * Each test uses its own address, so no other test can add a message here.
 */
export async function waitForSignInEmails(email: string, count = 1): Promise<SignInEmail[]> {
  await expect
    .poll(async () => (await messagesTo(email)).length, {
      message: `sign-in emails delivered to the test address`,
      timeout: DELIVERY_TIMEOUT_MS,
    })
    .toBe(count);

  return Promise.all((await messagesTo(email)).map((message) => readSignInEmail(message.ID)));
}
