import type { Locator, Page } from "@playwright/test";

import { ADMIN_PANEL_COPY, ADMIN_SIGN_IN_COPY } from "../lib/admin/copy.ts";
import { ENROLLMENT_COPY } from "../lib/admin/enrollment-copy.ts";
import { ACCOUNT_COPY, SIGN_IN_COPY } from "../lib/customer/copy.ts";
import { expect, test } from "./support/administrator.ts";
import { EDGE_CLIENT_IP_HEADER, WEB_ORIGIN } from "./support/environment.ts";
import { receiveSignInCode } from "./support/mailpit.ts";
import { totpCode } from "./support/totp.ts";

/**
 * Forms never put their fields in a URL (M2 T8e; S42). With JavaScript disabled, which is also what a
 * person meets before the page is interactive, each form with an email, a password, or a code is
 * filled and submitted by a click and by Enter. No request may carry a field value in its URL, and the
 * page keeps a URL without a query string. Failures name the query keys only, never their values.
 */

test.use({ javaScriptEnabled: false });

interface Field {
  label: string;
  value: string;
}

/** The URL with every query value replaced, so an assertion message never prints a field value. */
function redacted(url: string): string {
  const { pathname, searchParams } = new URL(url);
  const keys = [...searchParams.keys()].map((key) => `${key}=…`);
  return keys.length > 0 ? `${pathname}?${keys.join("&")}` : pathname;
}

function carries(url: string, value: string): boolean {
  const formEncoded = new URLSearchParams({ v: value }).toString().slice("v=".length);
  return [value, encodeURIComponent(value), formEncoded].some((form) => url.includes(form));
}

/**
 * The form's line for a browser without JavaScript. Playwright's text locators skip `<noscript>`, so
 * the note is read through its rendered text, which Chromium shows only when scripting is off.
 */
async function expectNoScriptNote(
  page: Page,
  text: string,
  note: Locator = page.locator("form noscript"),
) {
  await expect(note).toBeVisible();
  await expect(note).toHaveText(text, { useInnerText: true });
}

/**
 * Opens the page, fills the fields, and tries to submit them, once by clicking the button and once
 * by pressing Enter in the last field. Each attempt starts from a fresh page and is checked on its own.
 */
async function attemptSubmissions(page: Page, path: string, fields: Field[], button: string) {
  const requested: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  const values = fields.map((field) => field.value);
  const lastField = fields.at(-1);
  if (!lastField) {
    throw new Error("A form needs at least one field.");
  }

  const attempts: Record<string, () => Promise<void>> = {
    // `force` skips Playwright's wait for an enabled button: the test clicks as a person would.
    click: () => page.getByRole("button", { name: button }).click({ force: true }),
    Enter: () => page.getByLabel(lastField.label).press("Enter"),
  };

  for (const [name, attempt] of Object.entries(attempts)) {
    await page.goto(path);
    await expect(page).toHaveURL(path);
    const first = requested.length;
    for (const field of fields) {
      await page.getByLabel(field.label).fill(field.value);
    }
    await attempt();
    await page.waitForLoadState();

    const leaks = requested
      .slice(first)
      .filter((url) => values.some((value) => carries(url, value)));
    expect.soft(leaks.map(redacted), `requests after the ${name} attempt`).toEqual([]);
    expect.soft(redacted(page.url()), `page URL after the ${name} attempt`).toBe(path);
  }
}

test.describe("forms with JavaScript disabled", () => {
  test("/admin/ingresar never puts the email or the password in a URL", async ({
    page,
    administrator,
  }) => {
    await attemptSubmissions(
      page,
      "/admin/ingresar",
      [
        { label: ADMIN_SIGN_IN_COPY.emailLabel, value: administrator.email },
        { label: ADMIN_SIGN_IN_COPY.passwordLabel, value: administrator.password },
      ],
      ADMIN_SIGN_IN_COPY.continue,
    );
    await expectNoScriptNote(page, ADMIN_SIGN_IN_COPY.noScript);
  });

  test("/admin/activar never puts the password in a URL", async ({ page, administrator }) => {
    // A pending administrator's session, from Better Auth's endpoint: the sign-in form needs JavaScript.
    const signedIn = await page.request.post("/api/auth/sign-in/email", {
      data: { email: administrator.email, password: administrator.password },
      headers: { origin: WEB_ORIGIN },
    });
    expect(signedIn.status()).toBe(200);

    await attemptSubmissions(
      page,
      "/admin/activar",
      [{ label: ENROLLMENT_COPY.passwordLabel, value: administrator.password }],
      ENROLLMENT_COPY.start,
    );
    await expectNoScriptNote(page, ENROLLMENT_COPY.noScript);
  });

  test("/ingresar never puts the email in a URL", async ({ page, customerEmail }) => {
    await attemptSubmissions(
      page,
      "/ingresar",
      [{ label: SIGN_IN_COPY.emailLabel, value: customerEmail }],
      SIGN_IN_COPY.sendCode,
    );
    await expectNoScriptNote(page, SIGN_IN_COPY.noScript);
  });
});

/**
 * A POST to Better Auth through the web's proxy, which these tests use to sign in because the pages'
 * forms need JavaScript; the browser context keeps any cookie it sets.
 */
async function post(page: Page, path: string, data: object) {
  const response = await page.request.post(path, { data, headers: { origin: WEB_ORIGIN } });
  expect(response.status(), path).toBe(200);
}

/** The sign-out button never becomes usable without JavaScript, and the line next to it says why. */
async function expectSignOutNote(page: Page, label: string, text: string) {
  const button = page.getByRole("button", { name: label });
  await expect(button).toBeDisabled();
  await expectNoScriptNote(page, text, button.locator("xpath=following-sibling::noscript"));
}

test.describe("controls that act only through JavaScript", () => {
  test("stay disabled in the server's render and are enabled once the page is interactive", async ({
    page,
    browser,
    clientIp,
  }) => {
    // Without JavaScript the page keeps the server's render, the state before it is interactive
    // (T8e; R3-interactive-transition-asserted-by-constants).
    const controls = [
      ["/ingresar", SIGN_IN_COPY.sendCode],
      ["/admin/ingresar", ADMIN_SIGN_IN_COPY.continue],
    ] as const;
    for (const [path, name] of controls) {
      await page.goto(path);
      await expect(page.getByRole("button", { name }), path).toBeDisabled();
    }

    const interactive = await browser.newContext({
      baseURL: WEB_ORIGIN,
      javaScriptEnabled: true,
      extraHTTPHeaders: { [EDGE_CLIENT_IP_HEADER]: clientIp },
    });
    try {
      const interactivePage = await interactive.newPage();
      for (const [path, name] of controls) {
        await interactivePage.goto(path);
        await expect(interactivePage.getByRole("button", { name }), path).toBeEnabled();
      }
    } finally {
      await interactive.close();
    }
  });

  test("sign-out shows its line asking for JavaScript on /cuenta and /admin", async ({
    page,
    context,
    customerEmail,
    enrolledAdministrator,
  }) => {
    // R3-signout-noscript-line-unproved: the shared button speaks in the voice of each page.
    await post(page, "/api/auth/email-otp/send-verification-otp", {
      email: customerEmail,
      type: "sign-in",
    });
    await post(page, "/api/auth/sign-in/email-otp", {
      email: customerEmail,
      otp: await receiveSignInCode(customerEmail),
    });
    await page.goto("/cuenta");
    await expect(page.getByRole("definition").first()).toHaveText(customerEmail);
    await expectSignOutNote(page, ACCOUNT_COPY.signOut, ACCOUNT_COPY.noScript);

    await context.clearCookies();
    await post(page, "/api/auth/sign-in/email", {
      email: enrolledAdministrator.email,
      password: enrolledAdministrator.password,
    });
    await post(page, "/api/auth/two-factor/verify-totp", {
      code: totpCode(enrolledAdministrator.setupKey),
    });
    await page.goto("/admin");
    await expect(page.getByRole("definition")).toHaveText(enrolledAdministrator.email);
    await expectSignOutNote(page, ADMIN_PANEL_COPY.signOut, ADMIN_PANEL_COPY.noScript);
  });
});
