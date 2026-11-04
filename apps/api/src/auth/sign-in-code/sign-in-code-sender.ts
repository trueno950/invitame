import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import {
  EmailDeliveryService,
  EmailDeliveryUnavailableError,
} from "../../email/application/email-delivery.service";
import { BackgroundTasks } from "./background-tasks";
import { buildSignInCodeMessage } from "./sign-in-code-message";

/** The only OTP type that delivers a message; customers have no password and sign in by code. */
const SIGN_IN_TYPE = "sign-in";
const ADMIN_ROLE = "ADMIN";
export const SIGN_IN_CODE_DELIVERY_TASK = "sign_in_code_delivery";
export const SIGN_IN_CODE_DISCARD_TASK = "sign_in_code_discard";

export interface SignInCodeRequest {
  email: string;
  code: string;
  type: string;
}

/**
 * Verification storage seen by the sender, bound to one auth request. The adapter lives in
 * `better-auth-sign-in-code-store.ts`.
 */
export interface SignInCodeStore {
  /** The stored role of the account with this address, or null when there is none. */
  findRole(email: string): Promise<string | null>;
  /** Removes the rows that hold exactly this code; a newer code for the same address stays valid. */
  invalidateCode(request: SignInCodeRequest): Promise<void>;
  /** Removes every code of this type for the address, as Better Auth does for an unknown address. */
  discardCodes(request: SignInCodeRequest): Promise<void>;
}

/**
 * Handles Better Auth's `sendVerificationOTP` hook (ADR 0004 decisions 3 and 8, as amended). The
 * hook returns at once for every address, so the response never waits for, or depends on, the
 * role lookup or the delivery. In the background: an administrator receives no code and the code
 * is removed; a customer's code goes through `EmailDeliveryService`, and a code that still fails
 * after the bounded retries is invalidated without counting as a wrong attempt.
 */
@Injectable()
export class SignInCodeSender {
  constructor(
    private readonly delivery: EmailDeliveryService,
    private readonly tasks: BackgroundTasks,
  ) {}

  async handle(request: SignInCodeRequest, store: SignInCodeStore | undefined): Promise<void> {
    if (!store) {
      // Fail closed: without the request context the role cannot be checked, so nothing is sent.
      return;
    }

    if (request.type !== SIGN_IN_TYPE) {
      // Better Auth reaches this hook for other types only when the account exists, and deletes the
      // code itself otherwise. Doing the same deletion here keeps both paths alike; no code is sent.
      await this.tasks.runInline(SIGN_IN_CODE_DISCARD_TASK, () => store.discardCodes(request));
      return;
    }

    this.tasks.run(SIGN_IN_CODE_DELIVERY_TASK, () => this.deliver(request, store));
  }

  private async deliver(request: SignInCodeRequest, store: SignInCodeStore): Promise<void> {
    if ((await store.findRole(request.email)) === ADMIN_ROLE) {
      await store.invalidateCode(request);
      return;
    }

    const message = buildSignInCodeMessage({
      to: request.email,
      code: request.code,
      idempotencyKey: randomUUID(),
    });

    try {
      await this.delivery.send(message);
    } catch (error) {
      // No code that never reached the customer stays valid, whatever the failure.
      await store.invalidateCode(request);

      if (!(error instanceof EmailDeliveryUnavailableError)) {
        throw error;
      }
      // Expected outcome: EmailDeliveryService already retried and logged a privacy-safe event.
    }
  }
}
