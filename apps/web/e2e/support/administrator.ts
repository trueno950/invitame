import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import type { Browser, Page } from "@playwright/test";

import { ADMIN_SIGN_IN_COPY } from "../../lib/admin/copy.ts";
import { ENROLLMENT_COPY } from "../../lib/admin/enrollment-copy.ts";
import { test as customerTest, expect, newTestEmail, randomClientIp } from "./customer.ts";
import { EDGE_CLIENT_IP_HEADER, requireLocalUrl, WEB_ORIGIN } from "./environment.ts";
import { totpCode } from "./totp.ts";

/**
 * Administrators for the browser tests (M2 T9b part B; S38, L52). A fresh pending administrator comes
 * from the harness-only script `apps/api/test/create-e2e-administrator.ts`, which runs the same use
 * case, repository, and hasher as `admin:create` against the e2e database. The TOTP setup key and the
 * backup codes reach a test only from the enrollment page, as a person reads them (S41).
 */

const API_DIRECTORY = resolve(__dirname, "../../../api");
/** The backup codes enrollment shows: the API's `backupCodeOptions.amount` (`administrator-enrollment.ts`). */
export const BACKUP_CODE_COUNT = 10;
const run = promisify(execFile);

export interface Administrator {
  email: string;
  password: string;
}

export interface EnrolledAdministrator extends Administrator {
  /** The setup key as `/admin/activar` shows it, in groups of four. */
  setupKey: string;
  backupCodes: string[];
}

export async function createAdministrator(): Promise<Administrator> {
  const email = newTestEmail("admin");
  const { stdout } = await run(
    "node",
    ["-r", "@swc-node/register", "test/create-e2e-administrator.ts", email],
    {
      cwd: API_DIRECTORY,
      // Explicit, like the servers' settings: no other variable of the runner reaches the script.
      env: {
        NODE_ENV: "development",
        PATH: process.env.PATH ?? "",
        DATABASE_URL: requireLocalUrl("E2E_DATABASE_URL"),
      },
    },
  );
  const { password } = JSON.parse(stdout) as { password: string };
  return { email, password };
}

/** Fills the password step of `/admin/ingresar` and submits it. */
export async function submitPassword(page: Page, admin: Administrator): Promise<void> {
  await page.getByLabel(ADMIN_SIGN_IN_COPY.emailLabel).fill(admin.email);
  await page.getByLabel(ADMIN_SIGN_IN_COPY.passwordLabel).fill(admin.password);
  await page.getByRole("button", { name: ADMIN_SIGN_IN_COPY.continue }).click();
}

/** The setup key below the QR code, found by its accessible name like a screen reader would. */
export function setupKeyFigure(page: Page) {
  return page.getByRole("figure", { name: ENROLLMENT_COPY.setupKeyLabel, exact: true });
}

/** Signs a pending administrator in, which lands on `/admin/activar`, and starts enrollment. */
export async function startEnrollment(page: Page, admin: Administrator): Promise<string> {
  await page.goto("/admin/ingresar");
  await submitPassword(page, admin);
  await expect(page).toHaveURL("/admin/activar");
  // The full navigation commits the URL before the page's scripts run; wait for them like `goto`.
  await page.waitForLoadState();
  await page.getByLabel(ENROLLMENT_COPY.passwordLabel).fill(admin.password);
  await page.getByRole("button", { name: ENROLLMENT_COPY.start }).click();
  const figure = setupKeyFigure(page);
  await expect(figure).toBeVisible();
  return (await figure.locator("code").innerText()).trim();
}

/** Reads the backup codes of the last step, in the order shown. */
export async function readBackupCodes(page: Page): Promise<string[]> {
  const list = page.getByRole("list");
  await expect(list.getByRole("listitem")).toHaveCount(BACKUP_CODE_COUNT);
  return (await list.getByRole("listitem").allInnerTexts()).map((code) => code.trim());
}

/** The whole enrollment in its own browser context, ending on the panel. */
export async function enroll(browser: Browser, admin: Administrator) {
  const context = await browser.newContext({
    baseURL: WEB_ORIGIN,
    // Enrollment needs JavaScript, also for a test file that turns it off for its own pages.
    javaScriptEnabled: true,
    extraHTTPHeaders: { [EDGE_CLIENT_IP_HEADER]: randomClientIp() },
  });
  try {
    const page = await context.newPage();
    const setupKey = await startEnrollment(page, admin);
    await page.getByLabel(ENROLLMENT_COPY.codeLabel).fill(totpCode(setupKey));
    await page.getByRole("button", { name: ENROLLMENT_COPY.confirm }).click();
    const backupCodes = await readBackupCodes(page);
    await page.getByLabel(ENROLLMENT_COPY.savedCheck).check();
    await page.getByRole("button", { name: ENROLLMENT_COPY.savedCodes }).click();
    await expect(page).toHaveURL("/admin");
    return { ...admin, setupKey, backupCodes };
  } finally {
    await context.close();
  }
}

interface AdministratorFixtures {
  /** A pending administrator created for this test alone. */
  administrator: Administrator;
  /** An administrator this test alone enrolled through `/admin/activar` in another context. */
  enrolledAdministrator: EnrolledAdministrator;
}

/** Part A's fixtures (a client IP and a customer address per test) plus the administrators. */
export const test = customerTest.extend<AdministratorFixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads fixture dependencies from this pattern.
  administrator: async ({}, use) => {
    await use(await createAdministrator());
  },
  enrolledAdministrator: async ({ browser, administrator }, use) => {
    await use(await enroll(browser, administrator));
  },
});

export { expect };
