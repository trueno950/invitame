/**
 * An administrator account (`User.role = ADMIN`) is refused by both support transitions and by a sign-in-code
 * request (M9 T9; S4, S6): only the server-side commands change an administrator's credentials, and an
 * administrator signs in with a password and an authenticator app, never with an emailed code.
 */
export class AdminAccountProtectedError extends Error {
  constructor() {
    super("An administrator account is protected from the support actions.");
    this.name = "AdminAccountProtectedError";
  }
}

/** The account the request names is already DISABLED, so there is nothing to disable (M9 T9; S4). */
export class AccountAlreadyDisabledError extends Error {
  constructor() {
    super("The account is already disabled.");
    this.name = "AccountAlreadyDisabledError";
  }
}

/** The account the request names is already ACTIVE, so there is nothing to reactivate (M9 T9; L9). */
export class AccountAlreadyActiveError extends Error {
  constructor() {
    super("The account is already active.");
    this.name = "AccountAlreadyActiveError";
  }
}

/**
 * The account may not sign in by code: it is DISABLED or it is an administrator's. The sender refuses the same
 * accounts independently, so this refusal is the route's own answer and never what keeps a code from being sent.
 */
export class UserCannotSignInByCodeError extends Error {
  constructor() {
    super("The account cannot sign in with an emailed code.");
    this.name = "UserCannotSignInByCodeError";
  }
}
