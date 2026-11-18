"use server";

import {
  type AutosaveResult,
  catalogUnavailable,
  invalidPayload,
  mergeContent,
  mergeFeatureChanges,
  mergeRsvpChanges,
  parseContentChanges,
  parseFeatureChanges,
  parseRsvpChanges,
  refusal,
  savedResult,
} from "../../../lib/customer/invitation-autosave.ts";
import { invitationFieldsFor, sendInvitationCall } from "../../../lib/customer/invitations.ts";
import { isInvitationId } from "../../../lib/server/invitations-api.ts";
import { invitations } from "./_lib/api.ts";

/**
 * The autosave actions of the invitation editor (T2a; S2, S4). Each one answers a small serializable result instead
 * of redirecting, so the editor never navigates on a keystroke and nothing typed in another section is dropped:
 * a save that fails leaves the page, its fields, and the pending changes exactly where they were.
 *
 * A content autosave never writes the whole content. It reads the invitation as it is at that instant, merges only
 * the fields the creator changed into that content, and writes the result through the same server-side client the
 * content form uses, so the photo URL an upload wrote into the same content survives a save of another field (S2,
 * S4). The feature and RSVP autosaves fill the fields the creator did not change from what is stored, because the
 * API replaces each of those pairs whole.
 *
 * The payloads arrive from a browser and are untrusted: a field the pinned template does not declare is refused
 * before anything is sent, a value no control could have written refuses the payload whole, and no value, id, or
 * cookie is ever logged (the API client logs only the class of an unexpected failure).
 */

/** `PUT /invitations/:id/content` with only the changed fields merged into the stored content (S2, S4). */
export async function autosaveContentAction(id: string, changes: unknown): Promise<AutosaveResult> {
  if (!isInvitationId(id)) {
    return refusal("content", "not-found");
  }

  // The fields of the pinned version are read on the server from the creator catalog again, so the browser never
  // decides which keys may be written; a template no longer in the catalog refuses the save instead of guessing.
  const read = await sendInvitationCall(() => invitations.get(id));

  if (!read.ok) {
    return refusal("content", read.failure, read.issues);
  }

  const catalog = await sendInvitationCall(() => invitations.templates());

  if (!catalog.ok) {
    return refusal("content", catalog.failure, catalog.issues);
  }

  const pinned = invitationFieldsFor(catalog.value, read.value.templateVersionId);

  if (pinned === undefined) {
    return catalogUnavailable();
  }

  const parsed = parseContentChanges(pinned.fields, changes);

  if (!parsed.ok) {
    return invalidPayload(parsed.fieldIssues);
  }
  if (parsed.changes.length === 0) {
    // Nothing changed, so there is nothing to write and nothing to report as lost.
    return savedResult(new Date().toISOString());
  }

  const written = await sendInvitationCall(() =>
    invitations.replaceContent(id, mergeContent(read.value.content, parsed.changes)),
  );

  return written.ok
    ? savedResult(new Date().toISOString())
    : refusal("content", written.failure, written.issues);
}

/** `PUT /invitations/:id/features` with the changed fields and the stored ones it did not touch (S2, S4). */
export async function autosaveFeaturesAction(
  id: string,
  changes: unknown,
): Promise<AutosaveResult> {
  if (!isInvitationId(id)) {
    return refusal("features", "not-found");
  }

  const parsed = parseFeatureChanges(changes);

  if (!parsed.ok) {
    return invalidPayload(parsed.fieldIssues);
  }

  const read = await sendInvitationCall(() => invitations.get(id));

  if (!read.ok) {
    return refusal("features", read.failure, read.issues);
  }

  const written = await sendInvitationCall(() =>
    invitations.updateInvitationFeatures(
      id,
      mergeFeatureChanges(
        {
          timeZone: read.value.timeZone,
          whatsappPhone: read.value.featureSettings.whatsappPhone,
          playlistUrl: read.value.featureSettings.playlistUrl,
        },
        parsed.changes,
      ),
    ),
  );

  return written.ok
    ? savedResult(new Date().toISOString())
    : refusal("features", written.failure, written.issues);
}

/** `PUT /invitations/:id/rsvp-settings` with the changed settings and the stored one it did not touch (S2, S4). */
export async function autosaveRsvpSettingsAction(
  id: string,
  changes: unknown,
): Promise<AutosaveResult> {
  if (!isInvitationId(id)) {
    return refusal("rsvp", "not-found");
  }

  const parsed = parseRsvpChanges(changes);

  if (!parsed.ok) {
    return invalidPayload(parsed.fieldIssues);
  }

  const read = await sendInvitationCall(() => invitations.get(id));

  if (!read.ok) {
    return refusal("rsvp", read.failure, read.issues);
  }

  const stored = await sendInvitationCall(() => invitations.readRsvp(id));

  if (!stored.ok) {
    return refusal("rsvp", stored.failure, stored.issues);
  }

  // The deadline is a wall clock the creator wrote, and the invitation's own zone is what turns it into an instant,
  // exactly as the settings form does.
  const merged = mergeRsvpChanges(stored.value.settings, parsed.changes, read.value.timeZone);

  if (!merged.ok) {
    return invalidPayload(merged.fieldIssues);
  }

  const written = await sendInvitationCall(() =>
    invitations.updateRsvpSettings(id, merged.settings),
  );

  return written.ok
    ? savedResult(new Date().toISOString())
    : refusal("rsvp", written.failure, written.issues);
}
