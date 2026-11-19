import { randomInt, randomUUID } from "node:crypto";

import {
  type BrowserContext,
  test as base,
  type Cookie,
  expect,
  type Page,
} from "@playwright/test";

import { AUTOSAVE_COPY, SIGN_IN_COPY } from "../../lib/customer/copy.ts";
import { EDGE_CLIENT_IP_HEADER } from "./environment.ts";
import { receiveSignInCode } from "./mailpit.ts";

/** Better Auth's session cookie over local http (ADR 0004 decision 4; `session-settings.ts`). */
export const SESSION_COOKIE = "better-auth.session_token";

/** A private client address with about 16 million values, so no two tests share a rate limit. */
export function randomClientIp(): string {
  return `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
}

/** A fresh address of one kind of test user, in the reserved `.test` domain (RFC 2606). */
export function newTestEmail(kind: "customer" | "admin"): string {
  return `${kind}-${randomUUID()}@e2e.invitame.test`;
}

/** A fresh customer address: its emails, user, and per-email quota belong to one test alone. */
export function newCustomerEmail(): string {
  return newTestEmail("customer");
}

interface CustomerFixtures {
  /** The client IP the stand-in edge reports for this test's browser. */
  clientIp: string;
  /** A fresh address per test: its emails, user, and per-email quota belong to this test alone. */
  customerEmail: string;
}

/**
 * Every test gets its own address and its own client IP, so the per-email and per-IP limits
 * (S25) never couple two tests, in one run or across runs against the same database.
 */
export const test = base.extend<CustomerFixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads fixture dependencies from this pattern.
  clientIp: async ({}, use) => {
    await use(randomClientIp());
  },
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads fixture dependencies from this pattern.
  customerEmail: async ({}, use) => {
    await use(newCustomerEmail());
  },
  extraHTTPHeaders: async ({ clientIp }, use) => {
    await use({ [EDGE_CLIENT_IP_HEADER]: clientIp });
  },
});

export { expect };

export async function sessionCookie(context: BrowserContext): Promise<Cookie | undefined> {
  return (await context.cookies()).find((cookie) => cookie.name === SESSION_COOKIE);
}

/** Asks for a code on `/ingresar` and waits for the page to confirm the request. */
export async function requestCode(page: Page, email: string): Promise<void> {
  await page.goto("/ingresar");
  await page.getByLabel(SIGN_IN_COPY.emailLabel).fill(email);
  await page.getByRole("button", { name: SIGN_IN_COPY.sendCode }).click();
  await expect(
    page.getByRole("status").filter({ hasText: SIGN_IN_COPY.codeRequested(email) }),
  ).toBeVisible();
}

/** Types a code into the second step and submits it. */
export async function submitCode(page: Page, code: string): Promise<void> {
  await page.getByLabel(SIGN_IN_COPY.codeLabel).fill(code);
  await page.getByRole("button", { name: SIGN_IN_COPY.signIn, exact: true }).click();
}

/** The full sign-in by emailed code, ending signed in on `/cuenta`. */
export async function signIn(page: Page, email: string): Promise<void> {
  await requestCode(page, email);
  await submitCode(page, await receiveSignInCode(email));
  await expect(page).toHaveURL("/cuenta");
}

/** A 6-digit code that is certainly not `code`. */
export function otherCode(code: string): string {
  return String((Number(code) + 1) % 1_000_000).padStart(6, "0");
}

/**
 * The tabbed invitation editor (T2c; S1-S4). The editor saves each field on its own, so a test types into a field and
 * waits for the one status line to say the work is stored; it opens a tab by its accessible name, which also carries
 * what that tab still owes («Contenido · faltan 6»).
 */

/** Waits until the editor's status line says the last change is stored. */
export async function waitForSaved(page: Page): Promise<void> {
  await expect(page.getByRole("status", { name: AUTOSAVE_COPY.regionLabel })).toContainText(
    new RegExp(`${AUTOSAVE_COPY.savedMoment}|${AUTOSAVE_COPY.allSaved}`),
  );
}

/** Types into one field, leaves it (which flushes the save), and waits for the stored answer. */
export async function fillAutosaved(page: Page, label: string, value: string): Promise<void> {
  const field = page.getByLabel(label);
  await field.fill(value);
  await field.blur();
  await waitForSaved(page);
}

/**
 * Opens one card of the «Contenido» panel by the title its header shows (T2). A card that is already open is left as
 * it is, because pressing its header again would close it: only one card is open at a time and a closed card mounts no
 * field.
 */
export async function openContentCard(page: Page, title: string): Promise<void> {
  const header = page.getByRole("button", { name: new RegExp(`^${title}`) });

  if ((await header.getAttribute("aria-expanded")) !== "true") {
    await header.click();
  }
  await expect(header).toHaveAttribute("aria-expanded", "true");
}

/** Opens one of the editor's five tabs by its name, whichever list the viewport shows. */
export async function openEditorSection(page: Page, name: string): Promise<void> {
  await page.getByRole("tab", { name: new RegExp(`^${name}`) }).click();
}
