/** The outcome of disabling one user. */
export interface DisabledUser {
  userId: string;
  /** True when the user was already DISABLED before this call. */
  alreadyDisabled: boolean;
  /** Sessions deleted by this call. */
  revokedSessions: number;
}

/** Persistence port for account status changes; the adapter owns the transaction. */
export interface UserAccessRepository {
  /**
   * In one transaction: sets the user with this normalized email to DISABLED and deletes all of
   * their sessions. Returns null when no user has this email; changes nothing then.
   */
  disableAndRevokeSessions(email: string): Promise<DisabledUser | null>;
}
