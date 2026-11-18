// The failures of the invitation application layer (M4 T3; S3, S5, S6, S7, A1, A3, A4). The domain owns the
// rules about content, lifecycle, and package fit; these errors report an outcome the domain cannot state on
// its own: a unique slug that PostgreSQL already holds, a catalog record that is missing or not published, and
// a generated slug that could not be stored at all. Presentation maps them to HTTP; nothing here chooses a
// status code.

/**
 * The unique slug index refused a new invitation and PostgreSQL stored nothing: another invitation already
 * holds this slug. The create use case retries with a fresh generated slug; presentation never sees it
 * unless every attempt collides.
 */
export class InvitationSlugTakenError extends Error {
  constructor(readonly slug: string) {
    super(`The slug ${JSON.stringify(slug)} is already taken.`);
    this.name = "InvitationSlugTakenError";
  }
}

/**
 * No storable slug was found: every attempt collided with a stored invitation or drew a reserved word, and
 * the attempt bound is exhausted. Nothing was stored.
 */
export class InvitationSlugUnavailableError extends Error {
  constructor() {
    super("A unique invitation slug could not be generated; retry the request.");
    this.name = "InvitationSlugUnavailableError";
  }
}

/**
 * The chosen template version cannot start a draft: no version has this id, or it (or its template) is not
 * PUBLISHED (S3, S6). A missing and an unpublished version answer the same, so the caller learns nothing
 * about the catalog it may not read.
 */
export class InvitationTemplateVersionNotPublishedError extends Error {
  constructor() {
    super("The template version is not published.");
    this.name = "InvitationTemplateVersionNotPublishedError";
  }
}

/** The chosen package does not exist, so nothing can be validated against it (S6). */
export class InvitationPackageNotFoundError extends Error {
  constructor() {
    super("The package does not exist.");
    this.name = "InvitationPackageNotFoundError";
  }
}

/**
 * The package does not fit the pinned template version: it is not ACTIVE, or it does not include a feature
 * key that version's renderer requires (S6, A1). Creating a draft is free, so the package is only checked.
 */
export class InvitationPackageDoesNotFitError extends Error {
  constructor(readonly packageId: string) {
    super("The package does not include what the template version needs.");
    this.name = "InvitationPackageDoesNotFitError";
  }
}

/** The content does not match the schema of the pinned version; nothing was stored (S3, S7). */
export class InvalidInvitationContentError extends Error {
  constructor(readonly issues: readonly string[]) {
    super("The invitation content does not match the template version schema.");
    this.name = "InvalidInvitationContentError";
  }
}

/** Another writer committed between the read and the write, so a versioned content write stored nothing (S2). */
export class InvitationContentConflictError extends Error {
  constructor() {
    super("The invitation changed since the content was read.");
    this.name = "InvitationContentConflictError";
  }
}

/**
 * The feature data a request asked for is not acceptable (F1; S4): the zone is not an allow-list member or the
 * phone is not a Mexican ten-digit or international number. `issues` are the deterministic English explanations
 * the domain produced; nothing was stored.
 */
export class InvalidInvitationFeaturesError extends Error {
  constructor(readonly issues: readonly string[]) {
    super("The invitation features are not valid.");
    this.name = "InvalidInvitationFeaturesError";
  }
}

/**
 * The payment gate refused this publication (M5 T3; S6). Milestone 5 binds an adapter that always answers
 * "no payment required", so nothing throws this yet; Milestone 7 swaps the adapter and this outcome starts
 * arriving without any other change. `reason` is the machine-readable code the gate answered; nothing was
 * stored and the invitation is still a DRAFT.
 */
export class InvitationPaymentRequiredError extends Error {
  constructor(readonly reason: string) {
    super("The publication requires a payment.");
    this.name = "InvitationPaymentRequiredError";
  }
}

/**
 * A published invitation names a renderer the API cannot render (M5 T3; A3). This is an operational fault, not
 * a guest-facing "not found": the row is published and reachable, and only the deployed allow-list is missing
 * the code. It is a distinct type so the caller logs it as an operational error and still answers the guest
 * with the same friendly 404. `componentKey` is what the pinned version names, so the log says which renderer
 * the deployment lacks; null when the pinned version itself could not be read.
 */
export class PublicInvitationNotRenderableError extends Error {
  constructor(readonly componentKey: string | null) {
    super(
      componentKey === null
        ? "The published invitation has no renderable template version."
        : `The renderer ${JSON.stringify(componentKey)} is not registered.`,
    );
    this.name = "PublicInvitationNotRenderableError";
  }
}
