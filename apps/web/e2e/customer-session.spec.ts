import type { Page, Response } from "@playwright/test";

import { ACCOUNT_COPY, SIGN_IN_COPY } from "../lib/customer/copy.ts";
import {
  expect,
  newCustomerEmail,
  otherCode,
  randomClientIp,
  requestCode,
  sessionCookie,
  signIn,
  submitCode,
  test,
} from "./support/customer.ts";
import { EDGE_CLIENT_IP_HEADER, WEB_ORIGIN } from "./support/environment.ts";
import { receiveSignInCode, waitForSignInEmails } from "./support/mailpit.ts";

/**
 * Customer sign-in, account, and sign-out in a real browser (M2 T9b part A; S2, S38). The browser
 * drives the production build of `apps/web`, which proxies `/api/auth` to the real API and reads
 * `GET /me` from its server; the API stores users and sessions in PostgreSQL and delivers each code
 * through Mailpit, where the test reads it.
 */

const SIGN_IN_CODE_PATH = "/api/auth/sign-in/email-otp";

function accountHeading(page: Page) {
  return page.getByRole("heading", { level: 1, name: ACCOUNT_COPY.heading, exact: true });
}

function signInHeading(page: Page) {
  return page.getByRole("heading", { level: 1, name: SIGN_IN_COPY.heading, exact: true });
}

function alertWith(page: Page, text: string) {
  return page.getByRole("alert").filter({ hasText: text });
}

/** Submits a code and returns the answer of the web's `/api/auth` proxy to that submission. */
async function submitCodeAndWait(page: Page, code: string): Promise<Response> {
  const answer = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === SIGN_IN_CODE_PATH &&
      response.request().method() === "POST",
  );
  await submitCode(page, code);
  return answer;
}

test.describe("customer sign-in by emailed code", () => {
  test("signs in through the web origin only and shows the account that GET /me returns", async ({
    page,
    context,
    customerEmail,
  }) => {
    const requestedOrigins = new Set<string>();
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.protocol === "http:" || url.protocol === "https:") {
        requestedOrigins.add(url.origin);
      }
    });

    await requestCode(page, customerEmail);
    const emails = await waitForSignInEmails(customerEmail);
    expect(emails.map(({ recipients, subject }) => ({ recipients, subject }))).toEqual([
      { recipients: [customerEmail], subject: "Código de acceso a InvitaMe" },
    ]);
    expect(await sessionCookie(context)).toBeUndefined();

    const [message] = emails;
    if (!message) {
      throw new Error("No sign-in email arrived.");
    }
    await submitCode(page, message.code);

    await expect(page).toHaveURL("/cuenta");
    await expect(accountHeading(page)).toBeVisible();
    // The page renders on the web server from `GET /me`, called with this browser's cookie.
    await expect(page.getByRole("definition").first()).toHaveText(customerEmail);
    await expect(page.getByText(ACCOUNT_COPY.nameEmpty)).toBeVisible();

    // The session cookie is host-only on the web host: no `Domain`, so no other host receives it.
    expect(await sessionCookie(context)).toMatchObject({
      domain: new URL(WEB_ORIGIN).hostname,
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    });
    // Every request of the browser went to the web origin; the API is reached only by the web.
    expect([...requestedOrigins]).toEqual([WEB_ORIGIN]);
  });

  test("shows each customer only their own account when two customers browse at once", async ({
    browser,
    page,
    customerEmail,
  }) => {
    const otherEmail = newCustomerEmail();
    const otherContext = await browser.newContext({
      baseURL: WEB_ORIGIN,
      extraHTTPHeaders: { [EDGE_CLIENT_IP_HEADER]: randomClientIp() },
    });

    try {
      const otherPage = await otherContext.newPage();
      await Promise.all([signIn(page, customerEmail), signIn(otherPage, otherEmail)]);

      // One API client serves every request of the web process; each render must use its own cookie.
      await Promise.all([page.reload(), otherPage.reload()]);

      await expect(page.getByRole("definition").first()).toHaveText(customerEmail);
      await expect(otherPage.getByRole("definition").first()).toHaveText(otherEmail);
      await expect(page.getByText(otherEmail)).toHaveCount(0);
      await expect(otherPage.getByText(customerEmail, { exact: true })).toHaveCount(0);
    } finally {
      await otherContext.close();
    }
  });

  test("rejects a wrong code with the existing message and does not sign in", async ({
    page,
    context,
    customerEmail,
  }) => {
    await requestCode(page, customerEmail);
    const code = await receiveSignInCode(customerEmail);

    const answer = await submitCodeAndWait(page, otherCode(code));

    expect(answer.status()).toBe(400);
    await expect(alertWith(page, SIGN_IN_COPY.invalidCode)).toBeVisible();
    await expect(page).toHaveURL("/ingresar");
    expect(await sessionCookie(context)).toBeUndefined();

    await page.goto("/cuenta");
    await expect(page).toHaveURL("/ingresar");
    await expect(signInHeading(page)).toBeVisible();
  });

  test("refuses even the right code once a client has used its attempts for the minute", async ({
    page,
    context,
    customerEmail,
  }) => {
    await requestCode(page, customerEmail);
    const code = await receiveSignInCode(customerEmail);

    // S25: 3 code sign-in requests per minute per client IP. Each answer is checked by its status:
    // the alert keeps the same text across wrong attempts, so it proves only the last one.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const answer = await submitCodeAndWait(page, otherCode(code));
      expect(answer.status()).toBe(400);
    }
    await expect(alertWith(page, SIGN_IN_COPY.invalidCode)).toBeVisible();

    const answer = await submitCodeAndWait(page, code);

    expect(answer.status()).toBe(429);
    await expect(alertWith(page, SIGN_IN_COPY.tooManyAttempts)).toBeVisible();
    await expect(page).toHaveURL("/ingresar");
    expect(await sessionCookie(context)).toBeUndefined();
  });

  test("keeps an invalid address on the form without asking the API for a code", async ({
    page,
  }) => {
    const authRequests: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/api/auth/")) {
        authRequests.push(path);
      }
    });

    await page.goto("/ingresar");
    await page.getByLabel(SIGN_IN_COPY.emailLabel).fill("nombre@ejemplo");
    await page.getByRole("button", { name: SIGN_IN_COPY.sendCode }).click();

    await expect(alertWith(page, SIGN_IN_COPY.emailInvalid)).toBeVisible();
    await expect(page.getByLabel(SIGN_IN_COPY.codeLabel)).toHaveCount(0);
    expect(authRequests).toEqual([]);
  });
});

test.describe("customer account without a session", () => {
  test("sends a browser without a session cookie from /cuenta to /ingresar", async ({
    page,
    context,
  }) => {
    expect(await sessionCookie(context)).toBeUndefined();

    await page.goto("/cuenta");

    await expect(page).toHaveURL("/ingresar");
    await expect(signInHeading(page)).toBeVisible();
    const session = await page.request.get("/api/auth/get-session");
    expect(session.status()).toBe(200);
    expect(await session.json()).toBeNull();
  });
});

test.describe("customer sign-out", () => {
  test("ends the session, and the old session cookie no longer authorizes anything", async ({
    page,
    context,
    customerEmail,
  }) => {
    await signIn(page, customerEmail);
    const oldCookie = await sessionCookie(context);
    if (!oldCookie) {
      throw new Error("Signing in set no session cookie.");
    }

    // Control: while the session lives, the same cookie reads it through the web's proxy.
    const live = await page.request.get("/api/auth/get-session");
    expect(live.status()).toBe(200);
    expect((await live.json())?.user?.email).toBe(customerEmail);

    await page.getByRole("button", { name: ACCOUNT_COPY.signOut }).click();

    await expect(page).toHaveURL("/ingresar");
    await expect(signInHeading(page)).toBeVisible();
    expect(await sessionCookie(context)).toBeUndefined();
    await page.goto("/cuenta");
    await expect(page).toHaveURL("/ingresar");

    // Replay the old cookie. A page outside `proxy.ts`'s matcher leaves it in place...
    await context.addCookies([oldCookie]);
    await page.goto("/");
    expect((await sessionCookie(context))?.value).toBe(oldCookie.value);

    // ...while `/cuenta` gets no account: `GET /me` refuses it, and `proxy.ts`'s session read
    // through the proxy returns Better Auth's cleared cookie with the page.
    await page.goto("/cuenta");
    await expect(page).toHaveURL("/ingresar");
    await expect(signInHeading(page)).toBeVisible();
    await expect(page.getByText(customerEmail, { exact: true })).toHaveCount(0);
    expect(await sessionCookie(context)).toBeUndefined();

    // Better Auth's own endpoints refuse it too.
    await context.addCookies([oldCookie]);
    const replayed = await page.request.get("/api/auth/get-session");
    expect(replayed.status()).toBe(200);
    expect(await replayed.json()).toBeNull();
  });
});
