import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import {
  EmailDeliveryService,
  EmailDeliveryUnavailableError,
} from "../../email/application/email-delivery.service";
import { BackgroundTaskStageError, BackgroundTasks } from "./background-tasks";
import { buildSignInCodeMessage } from "./sign-in-code-message";

/** The only OTP type that delivers a message; customers have no password and sign in by code. */
const SIGN_IN_TYPE = "sign-in";
const ADMIN_ROLE = "ADMIN";
export const SIGN_IN_CODE_DELIVERY_TASK = "sign_in_code_delivery";
export const SIGN_IN_CODE_DISCARD_TASK = "sign_in_code_discard";

/** The stages of a background delivery, named in failure logs (L24). */
export const SIGN_IN_CODE_STAGE = {
  QUOTA: "quota",
  LOOKUP: "lookup",
  DELIVERY: "delivery",
  INVALIDATION: "invalidation",
} as const;

type SignInCodeStage = (typeof SIGN_IN_CODE_STAGE)[keyof typeof SIGN_IN_CODE_STAGE];

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
  /**
   * Counts one code request for the address and returns false when the per-email cap
   * (`EMAIL_CODE_QUOTA`) was already reached.
   */
  consumeEmailQuota(email: string): Promise<boolean>;
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
 * per-email cap, the role lookup, or the delivery. In the background, in this order: the request
 * counts against the per-email cap, and over the cap the code is removed unsent; an administrator
 * receives no code and the code is removed; a customer's code goes through `EmailDeliveryService`.
 * Whenever a stage fails before or during delivery, the code is invalidated, so no undelivered code
 * stays valid, and the failure is logged with its stage. A failed delivery does not count as a
 * wrong attempt.
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

    if (!this.tasks.run(SIGN_IN_CODE_DELIVERY_TASK, () => this.deliver(request, store))) {
      // At capacity or shutting down: the code is discarded rather than queued, so no undelivered
      // code stays valid; the tracker logged the rejection.
      await this.tasks.runInline(SIGN_IN_CODE_DISCARD_TASK, () => store.invalidateCode(request));
    }
  }

  private async deliver(request: SignInCodeRequest, store: SignInCodeStore): Promise<void> {
    const withinQuota = await this.beforeDelivery(SIGN_IN_CODE_STAGE.QUOTA, request, store, () =>
      store.consumeEmailQuota(request.email),
    );
    if (!withinQuota) {
      await this.invalidate(request, store);
      return;
    }

    const role = await this.beforeDelivery(SIGN_IN_CODE_STAGE.LOOKUP, request, store, () =>
      store.findRole(request.email),
    );
    if (role === ADMIN_ROLE) {
      await this.invalidate(request, store);
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
      await this.invalidate(request, store, SIGN_IN_CODE_STAGE.DELIVERY);

      if (!(error instanceof EmailDeliveryUnavailableError)) {
        throw new BackgroundTaskStageError(SIGN_IN_CODE_STAGE.DELIVERY, error);
      }
      // Expected outcome: EmailDeliveryService already retried and logged a privacy-safe event.
    }
  }

  /** Runs a stage before delivery; when it fails, the code is invalidated and the stage reported. */
  private async beforeDelivery<T>(
    stage: SignInCodeStage,
    request: SignInCodeRequest,
    store: SignInCodeStore,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      await this.invalidate(request, store, stage);
      throw new BackgroundTaskStageError(stage, error);
    }
  }

  private async invalidate(
    request: SignInCodeRequest,
    store: SignInCodeStore,
    failedAfter?: SignInCodeStage,
  ): Promise<void> {
    try {
      await store.invalidateCode(request);
    } catch (error) {
      throw new BackgroundTaskStageError(SIGN_IN_CODE_STAGE.INVALIDATION, error, failedAfter);
    }
  }
}
