import type { DisabledUser, UserAccessRepository } from "./user-access.repository";

export const DISABLE_USER_EVENT = {
  DISABLED: "user_disabled",
  NOT_FOUND: "user_disable_not_found",
  /** Written by the `user:disable` command, not the use case: an unexpected error, class name only. */
  FAILED: "user_disable_failed",
} as const;

/** Operational events carry the user id at most, never the email address. */
export type DisableUserEvent =
  | ({ event: typeof DISABLE_USER_EVENT.DISABLED } & DisabledUser)
  | { event: typeof DISABLE_USER_EVENT.NOT_FOUND };

export type DisableUserLog = (event: DisableUserEvent) => void;

export class InvalidEmailError extends Error {
  constructor() {
    super("Provide the email address of the user to disable.");
    this.name = "InvalidEmailError";
  }
}

/**
 * Disables a user and revokes every session they hold (ADR 0004 decision 6, S18). Idempotent: a
 * DISABLED user stays DISABLED, and any session left is still deleted. With no session left and
 * the guard checking the stored status on every request, the user loses access at once.
 */
export class DisableUserUseCase {
  constructor(
    private readonly users: UserAccessRepository,
    private readonly log: DisableUserLog,
  ) {}

  async execute(rawEmail: string): Promise<DisabledUser | null> {
    // Better Auth stores addresses lowercased.
    const email = rawEmail.trim().toLowerCase();
    if (!email.includes("@")) {
      throw new InvalidEmailError();
    }

    const disabled = await this.users.disableAndRevokeSessions(email);
    this.log(
      disabled
        ? { event: DISABLE_USER_EVENT.DISABLED, ...disabled }
        : { event: DISABLE_USER_EVENT.NOT_FOUND },
    );
    return disabled;
  }
}
