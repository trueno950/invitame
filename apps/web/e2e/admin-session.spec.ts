import type { Page, Request } from "@playwright/test";

import { ADMIN_PANEL_COPY, ADMIN_SIGN_IN_COPY } from "../lib/admin/copy.ts";
import { ENROLLMENT_COPY } from "../lib/admin/enrollment-copy.ts";
import {
  BACKUP_CODE_COUNT,
  expect,
  readBackupCodes,
  setupKeyFigure,
  submitPassword,
  test,
} from "./support/administrator.ts";
import { sessionCookie, signIn } from "./support/customer.ts";
import { WEB_ORIGIN } from "./support/environment.ts";
import { totpCode, wrongTotpCode } from "./support/totp.ts";

/**
 * Administrator enrollment, sign-in with the second factor, the panel, and sign-out in a real browser
 * (M2 T9b part B; S2, S38, S41). Each administrator is created for one test by the harness-only
 * script and enrolled through `/admin/activar`; the TOTP codes come from the setup key read on that
 * page, and the backup codes from its last step. The pages read the session on the web server with
 * `get-session` through the web's own proxy (`lib/server/session-api.ts`).
 */

function alertWith(page: Page, text: string) {
  return page.getByRole("alert").filter({ hasText: text });
}

function heading(page: Page, name: string) {
  return page.getByRole("heading", { level: 1, name, exact: true });
}

/**
 * Clicks «Cerrar sesión» once and waits for the sign-in page. The button stays disabled until the page
 * is interactive (T8e; S42), so one click on the enabled button signs out, with exactly one request
 * (R3-sign-out-retry-not-idempotent, R4-signout-retry-cannot-recover-after-navigation).
 */
async function signOutOfPanel(page: Page) {
  const signOutRequests: string[] = [];
  const countSignOut = (request: Request) => {
    if (new URL(request.url()).pathname === "/api/auth/sign-out") {
      signOutRequests.push(request.method());
    }
  };
  page.on("request", countSignOut);

  const button = page.getByRole("button", { name: ADMIN_PANEL_COPY.signOut });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page).toHaveURL("/admin/ingresar");
  // Like `page.goto`, wait for the page's scripts before using its form.
  await page.waitForLoadState();

  page.off("request", countSignOut);
  expect(signOutRequests).toEqual(["POST"]);
}

/** The session Better Auth's own endpoint reads for this browser's cookie, through the proxy. */
async function readSession(page: Page) {
  const response = await page.request.get("/api/auth/get-session");
  expect(response.status()).toBe(200);
  return (await response.json()) as { user: { email: string; twoFactorEnabled: boolean } } | null;
}

test.describe("administrator enrollment at /admin/activar", () => {
  test("enrolls with the key read below the QR code and shows the backup codes once", async ({
    page,
    administrator,
  }) => {
    // Anonymous visitors cannot reach the enrollment page.
    await page.goto("/admin/activar");
    await expect(page).toHaveURL("/admin/ingresar");

    // A pending administrator's password sign-in lands on the enrollment page, and the other
    // administrator pages send it back there: only `get-session` tells it apart.
    await submitPassword(page, administrator);
    await expect(page).toHaveURL("/admin/activar");
    await expect(heading(page, ENROLLMENT_COPY.heading)).toBeVisible();
    for (const path of ["/admin", "/admin/ingresar"]) {
      await page.goto(path);
      await expect(page).toHaveURL("/admin/activar");
    }
    await expect(setupKeyFigure(page)).toHaveCount(0);

    // Step 1: the password, refused when missing or wrong.
    await page.getByRole("button", { name: ENROLLMENT_COPY.start }).click();
    await expect(alertWith(page, ENROLLMENT_COPY.passwordMissing)).toBeVisible();
    await page.getByLabel(ENROLLMENT_COPY.passwordLabel).fill(`${administrator.password}x`);
    await page.getByRole("button", { name: ENROLLMENT_COPY.start }).click();
    await expect(alertWith(page, ENROLLMENT_COPY.invalidPassword)).toBeVisible();
    await expect(setupKeyFigure(page)).toHaveCount(0);
    await page.getByLabel(ENROLLMENT_COPY.passwordLabel).fill(administrator.password);
    await page.getByRole("button", { name: ENROLLMENT_COPY.start }).click();

    // Step 2: the QR code and, below it, the same secret as a key in groups of four (S41).
    await expect(page.getByRole("img", { name: ENROLLMENT_COPY.qrLabel })).toBeVisible();
    const key = (await setupKeyFigure(page).locator("code").innerText()).trim();
    expect(key).toMatch(/^[A-Z2-7]{4}( [A-Z2-7]{4})*( [A-Z2-7]{1,3})?$/);

    await page.getByLabel(ENROLLMENT_COPY.codeLabel).fill("123");
    await page.getByRole("button", { name: ENROLLMENT_COPY.confirm }).click();
    await expect(alertWith(page, ENROLLMENT_COPY.codeIncomplete)).toBeVisible();
    await page.getByLabel(ENROLLMENT_COPY.codeLabel).fill(wrongTotpCode(key));
    await page.getByRole("button", { name: ENROLLMENT_COPY.confirm }).click();
    await expect(alertWith(page, ENROLLMENT_COPY.invalidCode)).toBeVisible();
    expect((await readSession(page))?.user.twoFactorEnabled).toBe(false);

    await page.getByLabel(ENROLLMENT_COPY.codeLabel).fill(totpCode(key));
    await page.getByRole("button", { name: ENROLLMENT_COPY.confirm }).click();

    // Step 3: ten backup codes, shown once; the key and the QR code are gone.
    await expect(page.getByRole("heading", { name: ENROLLMENT_COPY.backupHeading })).toBeVisible();
    const backupCodes = await readBackupCodes(page);
    await expect(page.getByText(ENROLLMENT_COPY.backupCount(BACKUP_CODE_COUNT))).toBeVisible();
    expect(new Set(backupCodes).size).toBe(BACKUP_CODE_COUNT);
    await expect(setupKeyFigure(page)).toHaveCount(0);
    await expect(page.getByRole("img", { name: ENROLLMENT_COPY.qrLabel })).toHaveCount(0);
    expect((await readSession(page))?.user.twoFactorEnabled).toBe(true);

    await page.getByRole("button", { name: ENROLLMENT_COPY.savedCodes }).click();
    await expect(alertWith(page, ENROLLMENT_COPY.savedMissing)).toBeVisible();
    await page.getByLabel(ENROLLMENT_COPY.savedCheck).check();
    await page.getByRole("button", { name: ENROLLMENT_COPY.savedCodes }).click();

    await expect(page).toHaveURL("/admin");
    await expect(page.getByRole("definition")).toHaveText(administrator.email);

    // Enrolled: the enrollment page now sends the administrator to the panel, never showing the
    // backup codes again.
    await page.goto("/admin/activar");
    await expect(page).toHaveURL("/admin");
    await expect(page.getByText(backupCodes[0] ?? "", { exact: true })).toHaveCount(0);
  });

  test("tells the administrator to sign in again when the session ends during enrollment", async ({
    page,
    administrator,
  }) => {
    await page.goto("/admin/ingresar");
    await submitPassword(page, administrator);
    await expect(page).toHaveURL("/admin/activar");
    await page.waitForLoadState();

    // The session ends elsewhere, for example by a sign-out in another tab.
    const signOut = await page.request.post("/api/auth/sign-out", {
      headers: { origin: WEB_ORIGIN },
    });
    expect(signOut.status()).toBe(200);

    await page.getByLabel(ENROLLMENT_COPY.passwordLabel).fill(administrator.password);
    await page.getByRole("button", { name: ENROLLMENT_COPY.start }).click();

    await expect(alertWith(page, ENROLLMENT_COPY.sessionEnded)).toBeVisible();
    await expect(setupKeyFigure(page)).toHaveCount(0);
    await page.getByRole("link", { name: ENROLLMENT_COPY.signInAgain }).click();
    await expect(page).toHaveURL("/admin/ingresar");
  });
});

test.describe("administrator sign-in with the second factor", () => {
  test("keeps a wrong or incomplete password step on the form with the existing messages", async ({
    page,
    context,
    administrator,
  }) => {
    const authRequests: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/api/auth/")) {
        authRequests.push(path);
      }
    });

    await page.goto("/admin/ingresar");
    await page.getByLabel(ADMIN_SIGN_IN_COPY.emailLabel).fill("nombre@ejemplo");
    await page.getByRole("button", { name: ADMIN_SIGN_IN_COPY.continue }).click();
    await expect(alertWith(page, ADMIN_SIGN_IN_COPY.emailInvalid)).toBeVisible();
    await page.getByLabel(ADMIN_SIGN_IN_COPY.emailLabel).fill(administrator.email);
    await page.getByRole("button", { name: ADMIN_SIGN_IN_COPY.continue }).click();
    await expect(alertWith(page, ADMIN_SIGN_IN_COPY.passwordMissing)).toBeVisible();
    expect(authRequests).toEqual([]);

    await submitPassword(page, { ...administrator, password: `${administrator.password}x` });

    await expect(alertWith(page, ADMIN_SIGN_IN_COPY.invalidCredentials)).toBeVisible();
    await expect(page).toHaveURL("/admin/ingresar");
    await expect(page.getByLabel(ADMIN_SIGN_IN_COPY.codeLabel)).toHaveCount(0);
    expect(await sessionCookie(context)).toBeUndefined();
  });

  test("signs in with the password and then the app's code; a wrong code grants nothing", async ({
    page,
    context,
    enrolledAdministrator,
  }) => {
    await page.goto("/admin/ingresar");
    await submitPassword(page, enrolledAdministrator);
    await expect(page.getByRole("heading", { name: ADMIN_SIGN_IN_COPY.codeHeading })).toBeVisible();

    await page.getByLabel(ADMIN_SIGN_IN_COPY.codeLabel).fill("12");
    await page.getByRole("button", { name: ADMIN_SIGN_IN_COPY.signIn, exact: true }).click();
    await expect(alertWith(page, ADMIN_SIGN_IN_COPY.codeIncomplete)).toBeVisible();

    await page
      .getByLabel(ADMIN_SIGN_IN_COPY.codeLabel)
      .fill(wrongTotpCode(enrolledAdministrator.setupKey));
    await page.getByRole("button", { name: ADMIN_SIGN_IN_COPY.signIn, exact: true }).click();
    await expect(alertWith(page, ADMIN_SIGN_IN_COPY.invalidCode)).toBeVisible();
    await expect(page).toHaveURL("/admin/ingresar");
    expect(await sessionCookie(context)).toBeUndefined();
    expect(await readSession(page)).toBeNull();

    await page
      .getByLabel(ADMIN_SIGN_IN_COPY.codeLabel)
      .fill(totpCode(enrolledAdministrator.setupKey));
    await page.getByRole("button", { name: ADMIN_SIGN_IN_COPY.signIn, exact: true }).click();

    await expect(page).toHaveURL("/admin");
    await expect(page.getByRole("definition")).toHaveText(enrolledAdministrator.email);
    expect(await sessionCookie(context)).toMatchObject({ httpOnly: true, sameSite: "Lax" });
    for (const path of ["/admin/ingresar", "/admin/activar"]) {
      await page.goto(path);
      await expect(page).toHaveURL("/admin");
    }
  });

  test("signs in with a backup code instead, and each backup code works only once", async ({
    page,
    context,
    enrolledAdministrator,
  }) => {
    const [backupCode] = enrolledAdministrator.backupCodes;
    if (!backupCode) {
      throw new Error("Enrollment showed no backup code.");
    }
    const useBackupCode = async (code: string) => {
      await page.getByRole("button", { name: ADMIN_SIGN_IN_COPY.useBackupCode }).click();
      await page.getByLabel(ADMIN_SIGN_IN_COPY.backupLabel).fill(code);
      await page.getByRole("button", { name: ADMIN_SIGN_IN_COPY.signIn, exact: true }).click();
    };

    await page.goto("/admin/ingresar");
    await submitPassword(page, enrolledAdministrator);
    await useBackupCode("aaaaa-bbbbb");
    await expect(alertWith(page, ADMIN_SIGN_IN_COPY.invalidBackupCode)).toBeVisible();
    expect(await sessionCookie(context)).toBeUndefined();

    // Back to the app's code and to the password step, then the backup code itself.
    await page.getByRole("button", { name: ADMIN_SIGN_IN_COPY.useAuthenticatorCode }).click();
    await expect(page.getByLabel(ADMIN_SIGN_IN_COPY.codeLabel)).toBeFocused();
    await page.getByRole("button", { name: ADMIN_SIGN_IN_COPY.startOver }).click();
    await expect(page.getByLabel(ADMIN_SIGN_IN_COPY.passwordLabel)).toBeFocused();
    await submitPassword(page, enrolledAdministrator);
    await expect(page.getByLabel(ADMIN_SIGN_IN_COPY.codeLabel)).toBeVisible();
    await useBackupCode(backupCode);

    await expect(page).toHaveURL("/admin");
    await expect(page.getByRole("definition")).toHaveText(enrolledAdministrator.email);

    // Sign out and try the same backup code again: it was used up.
    await signOutOfPanel(page);
    await submitPassword(page, enrolledAdministrator);
    await useBackupCode(backupCode);
    await expect(alertWith(page, ADMIN_SIGN_IN_COPY.invalidBackupCode)).toBeVisible();
    expect(await sessionCookie(context)).toBeUndefined();
  });
});

test.describe("administrator panel and sign-out", () => {
  test("ends the session, and the old session cookie no longer opens the panel", async ({
    page,
    context,
    enrolledAdministrator,
  }) => {
    await page.goto("/admin/ingresar");
    await submitPassword(page, enrolledAdministrator);
    await page
      .getByLabel(ADMIN_SIGN_IN_COPY.codeLabel)
      .fill(totpCode(enrolledAdministrator.setupKey));
    await page.getByRole("button", { name: ADMIN_SIGN_IN_COPY.signIn, exact: true }).click();
    await expect(page).toHaveURL("/admin");
    await expect(heading(page, ADMIN_PANEL_COPY.heading)).toBeVisible();
    await expect(page.getByText(ADMIN_PANEL_COPY.sessionNote)).toBeVisible();

    const oldCookie = await sessionCookie(context);
    if (!oldCookie) {
      throw new Error("Signing in set no session cookie.");
    }
    // Control: while the session lives, the same cookie reads it.
    expect((await readSession(page))?.user.email).toBe(enrolledAdministrator.email);

    await signOutOfPanel(page);

    expect(await sessionCookie(context)).toBeUndefined();

    // Replay the old cookie: no administrator page opens, and Better Auth reads no session.
    await context.addCookies([oldCookie]);
    for (const path of ["/admin", "/admin/activar"]) {
      await page.goto(path);
      await expect(page).toHaveURL("/admin/ingresar");
    }
    await expect(page.getByText(enrolledAdministrator.email, { exact: true })).toHaveCount(0);
    expect(await readSession(page)).toBeNull();
  });

  test("sends anonymous visitors to sign in and customers to their own account", async ({
    page,
    customerEmail,
  }) => {
    for (const path of ["/admin", "/admin/activar"]) {
      await page.goto(path);
      await expect(page).toHaveURL("/admin/ingresar");
      await expect(heading(page, ADMIN_SIGN_IN_COPY.heading)).toBeVisible();
    }

    await signIn(page, customerEmail);
    for (const path of ["/admin", "/admin/activar", "/admin/ingresar"]) {
      await page.goto(path);
      await expect(page).toHaveURL("/cuenta");
    }
  });
});
