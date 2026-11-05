import { parseDisplayName } from "../domain/display-name";
import type { OwnProfile, OwnProfileRepository } from "./own-profile.repository";

export class InvalidDisplayNameError extends Error {
  constructor() {
    super("displayName must be 1 to 120 characters after trimming, without control characters.");
    this.name = "InvalidDisplayNameError";
  }
}

/** Reads the profile of the user who owns the session. */
export class GetOwnProfileUseCase {
  constructor(private readonly profiles: OwnProfileRepository) {}

  execute(userId: string): Promise<OwnProfile | null> {
    return this.profiles.findById(userId);
  }
}

/**
 * Sets or clears the display name of the user who owns the session. The name is validated again here,
 * so a caller other than the HTTP route cannot store an unbounded value.
 */
export class UpdateOwnProfileUseCase {
  constructor(private readonly profiles: OwnProfileRepository) {}

  execute(userId: string, displayName: string | null): Promise<OwnProfile | null> {
    if (displayName === null) {
      return this.profiles.updateDisplayName(userId, null);
    }

    const parsed = parseDisplayName(displayName);
    if (parsed === null) {
      throw new InvalidDisplayNameError();
    }
    return this.profiles.updateDisplayName(userId, parsed);
  }
}
