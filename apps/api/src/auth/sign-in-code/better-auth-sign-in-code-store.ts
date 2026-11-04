import { createHash } from "node:crypto";

import type { emailOTP } from "better-auth/plugins";

import type { SignInCodeRequest, SignInCodeStore } from "./sign-in-code-sender";

type EmailOTPOptions = Parameters<typeof emailOTP>[0];
/** The endpoint context Better Auth passes to `sendVerificationOTP`. */
export type SignInCodeEndpointContext = NonNullable<
  Parameters<EmailOTPOptions["sendVerificationOTP"]>[1]
>;

/**
 * Mirrors Better Auth 1.7.16's email OTP storage (`plugins/email-otp/utils.mjs`): the identifier is
 * `<type>-otp-<email>` and, with `storeOTP: "hashed"`, the value is the unpadded base64url SHA-256
 * of the code followed by `:<attempts>`. The sign-in code tests pin both shapes.
 */
function verificationIdentifier(request: SignInCodeRequest): string {
  return `${request.type}-otp-${request.email.toLowerCase()}`;
}

function storedCodePrefix(code: string): string {
  return `${createHash("sha256").update(code).digest("base64url")}:`;
}

/** Binds the sender's storage port to Better Auth's adapters for one auth request. */
export function createBetterAuthSignInCodeStore(
  context: SignInCodeEndpointContext,
): SignInCodeStore {
  const { adapter, internalAdapter } = context.context;

  return {
    async findRole(email) {
      const found = await internalAdapter.findUserByEmail(email);
      // `role` is the additional field declared in `createAuth`; this context type does not carry it.
      const role: unknown = (found?.user as { role?: unknown } | undefined)?.role;
      return typeof role === "string" ? role : null;
    },

    async invalidateCode(request) {
      // Match by stored code, not row id: a wrong attempt re-creates the row under a new id, and a
      // later request for the same address adds a newer row that must stay valid.
      await adapter.deleteMany({
        model: "verification",
        where: [
          { field: "identifier", value: verificationIdentifier(request) },
          { field: "value", operator: "starts_with", value: storedCodePrefix(request.code) },
        ],
      });
    },

    async discardCodes(request) {
      await internalAdapter.deleteVerificationByIdentifier(verificationIdentifier(request));
    },
  };
}
