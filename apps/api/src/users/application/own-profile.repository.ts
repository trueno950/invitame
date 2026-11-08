/** The signed-in user's own profile: the first creator-owned resource (S1, S9). */
export interface OwnProfile {
  id: string;
  email: string;
  /** Null when the user has not set a name. */
  displayName: string | null;
  role: "CUSTOMER" | "ADMIN";
}

/** Persistence port for the own profile; every operation is keyed by the session's user id. */
export interface OwnProfileRepository {
  /** Returns the stored profile, or null when no user has this id. */
  findById(userId: string): Promise<OwnProfile | null>;
  /**
   * Stores a validated display name (null clears it); returns null, storing nothing, when no user has
   * this id or the account is not ACTIVE (S53).
   */
  updateDisplayName(userId: string, displayName: string | null): Promise<OwnProfile | null>;
}

export const OWN_PROFILE_REPOSITORY = Symbol("OwnProfileRepository");
