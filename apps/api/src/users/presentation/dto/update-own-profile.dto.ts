import { ValidateBy, ValidateIf } from "class-validator";

import { DISPLAY_NAME_MAX_LENGTH, parseDisplayName } from "../../domain/display-name";

/** `PATCH /me` body. The global ValidationPipe rejects any other field (`forbidNonWhitelisted`). */
export class UpdateOwnProfileDto {
  /** A name of 1 to 120 characters after trimming, without control characters; null clears it. */
  @ValidateIf((_body: unknown, value: unknown) => value !== null)
  @ValidateBy({
    name: "isDisplayName",
    validator: {
      validate: (value: unknown) => typeof value === "string" && parseDisplayName(value) !== null,
      defaultMessage: () =>
        `displayName must be null or 1 to ${DISPLAY_NAME_MAX_LENGTH} characters after trimming, without control characters`,
    },
  })
  displayName!: string | null;
}
