import { Inject, Injectable } from "@nestjs/common";
import { AuthService } from "@thallesp/nestjs-better-auth";

/**
 * The one narrow port the users module needs to resend a sign-in code (M9 T9; S4, S6, L9). An administrator asks for a
 * new code for an account; Better Auth's own `POST /email-otp/send-verification-otp` endpoint does the rest, so the
 * per-email quota (`EMAIL_CODE_QUOTA`, five per hour), the hashed storage, the expiry, the wrong-attempt cap, and the
 * sender's own refusals — an administrator, a DISABLED account, an over-quota request — apply exactly as they do for a
 * customer's own request. Nothing here re-implements, loosens, or bypasses any of them.
 *
 * `requestSignInCode` answers when the request has been made, never when a message has been delivered: delivery is the
 * sender's own background task, and no caller may state it succeeded.
 */
export interface SignInCodeResender {
  /** Triggers Better Auth's sign-in-code request for `email` through its own endpoint, server-side. */
  requestSignInCode(email: string): Promise<void>;
}

export const SIGN_IN_CODE_RESENDER = Symbol("SignInCodeResender");

/**
 * The one plugin endpoint this port calls, declared here because the email-OTP plugin's inferred endpoint type
 * references a transitive zod path that declaration output cannot name — the same reason `createAuth` returns the
 * generic `Auth` (`auth.factory.ts`). No request, response, or provider type is involved: the call is Better Auth's own
 * endpoint method, entered at `toAuthEndpoints`.
 */
interface SignInCodeEndpointApi {
  sendVerificationOTP(input: { body: { email: string; type: "sign-in" } }): Promise<unknown>;
}

/**
 * `SignInCodeResender` over the running Better Auth instance (`AuthService.api`), which `AuthModule` provides globally.
 *
 * The call is the endpoint's own server-side method, `auth.api.sendVerificationOTP({ body: { email, type: "sign-in" }
 * })`, not a request to its HTTP handler, so:
 * - the per-email quota still applies, because the sender counts it in the request's own store before any delivery;
 * - the per-IP limit does not apply: Better Auth's rate limiter and the plugin's `rateLimit` rules run in the router's
 *   `onRequest` (`api/index.mjs`), which only the HTTP handler (`auth.handler`) invokes, while `auth.api.*` enters at
 *   `toAuthEndpoints` → `dispatchAuthEndpoint` and so never reaches it (M9 T9 finding, recorded in
 *   `docs/architecture/overview.md`). The administrator's own `@AdminOnly()` session is the guard for this path, and
 *   the call is one in-process request, not a client-facing endpoint;
 * - the request's `hooks.before` (the session-access hook) still runs, and with no cookie on the call it does nothing.
 *
 * A refusal Better Auth itself raises (a malformed address, a store failure) propagates: the caller answers an
 * unexpected failure, and the audit row it already committed keeps recording that the request was made.
 */
@Injectable()
export class BetterAuthSignInCodeResender implements SignInCodeResender {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async requestSignInCode(email: string): Promise<void> {
    const api = this.auth.api as unknown as SignInCodeEndpointApi;
    await api.sendVerificationOTP({ body: { email, type: "sign-in" } });
  }
}
