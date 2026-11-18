"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import {
  type AutosaveQueueState,
  createAutosaveQueue,
} from "../../../../../lib/customer/autosave-queue.ts";
import { AUTOSAVE_COPY } from "../../../../../lib/customer/copy.ts";
import type {
  AutosaveChannel,
  AutosaveResult,
  FeatureChanges,
  RsvpChanges,
} from "../../../../../lib/customer/invitation-autosave.ts";
import {
  autosaveContentAction,
  autosaveFeaturesAction,
  autosaveRsvpSettingsAction,
} from "../../autosave-actions.ts";

/**
 * The client glue of the editor's autosave (T2a; S2, S4). One queue per invitation, bound to the three server
 * actions, so a section of the editor is written the moment the creator stops typing or leaves a field, and the
 * status line, the retry, and the leave guard all read the same state.
 *
 * The editor never submits a form. A content field reports the value it holds, never the whole content:
 *
 * ```tsx
 * const autosave = useAutosave({ invitationId: id, onSaved: () => router.refresh() });
 *
 * <input
 *   onChange={(event) => autosave.changeContent({ [field.name]: event.target.value })}
 *   onBlur={() => void autosave.flush()}
 * />
 * ```
 *
 * The same hook serves the feature and RSVP sections through `changeFeatures` and `changeRsvp`; the payload of each
 * one names only the field that changed, and the server action fills the rest from what is stored.
 */

/** The state a server render shows: nothing is dirty or in flight before the browser runs the queue. */
const SERVER_STATE: AutosaveQueueState = { kind: "idle" };

export interface UseAutosaveOptions {
  /** The invitation every save is written to. */
  readonly invitationId: string;
  /** How long a change waits after the last keystroke; the queue's own default when it is left out. */
  readonly debounceMs?: number;
  /** Called after a save the API accepted, so the page can refresh the preview of the stored draft (T2b). */
  readonly onSaved?: (channel: AutosaveChannel) => void;
}

/** What the editor's fields, its status line, and its retry button use. */
export interface AutosaveApi {
  /** The state the status line renders. */
  readonly state: AutosaveQueueState;
  /** Whether anything is pending, in flight, or failed, which is what the leave guard answers. */
  readonly unsaved: boolean;
  /** Records the content fields the creator changed; a cleared value travels as `null` or an empty text. */
  changeContent(changes: Readonly<Record<string, unknown>>): void;
  /** Records the feature fields the creator changed. */
  changeFeatures(changes: FeatureChanges): void;
  /** Records the RSVP settings the creator changed. */
  changeRsvp(changes: RsvpChanges): void;
  /** Saves everything pending at once; the way a `blur` asks for the change to be on its way now. */
  flush(): Promise<void>;
  /** Tries a failed channel again with the changes it kept. */
  retry(): void;
}

export function useAutosave(options: UseAutosaveOptions): AutosaveApi {
  const invitationId = options.invitationId;
  const debounceMs = options.debounceMs;
  const onSaved = options.onSaved;
  const onSavedRef = useRef(onSaved);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const queue = useMemo(
    () =>
      createAutosaveQueue({
        save: async (request) => {
          const result: AutosaveResult =
            request.channel === "content"
              ? await autosaveContentAction(invitationId, request.fields)
              : request.channel === "features"
                ? await autosaveFeaturesAction(invitationId, request.fields)
                : await autosaveRsvpSettingsAction(invitationId, request.fields);

          if (result.ok) {
            onSavedRef.current?.(request.channel);
          }
          return result;
        },
        ...(debounceMs === undefined ? {} : { debounceMs }),
      }),
    [invitationId, debounceMs],
  );

  const state = useSyncExternalStore(queue.subscribe, queue.state, () => SERVER_STATE);
  const unsaved = state.kind === "dirty" || state.kind === "saving" || state.kind === "error";

  // Unmounting sends what is still pending or failed instead of dropping it, and the browser asks before a full
  // page leave while anything is unsaved (S2).
  useEffect(() => () => queue.dispose(), [queue]);

  // While anything is unsaved the browser asks before leaving: the queue's own saves may still be on their way, and
  // a failed one holds the changes the creator typed (S2).
  useEffect(() => {
    if (!unsaved) {
      return;
    }

    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = AUTOSAVE_COPY.leaveWarning;
    };

    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [unsaved]);

  const changeContent = useCallback(
    (changes: Readonly<Record<string, unknown>>) => queue.change("content", changes),
    [queue],
  );
  const changeFeatures = useCallback(
    (changes: FeatureChanges) => queue.change("features", { ...changes }),
    [queue],
  );
  const changeRsvp = useCallback(
    (changes: RsvpChanges) => queue.change("rsvp", { ...changes }),
    [queue],
  );
  const flush = useCallback(() => queue.flush(), [queue]);
  const retry = useCallback(() => queue.retry(), [queue]);

  return { state, unsaved, changeContent, changeFeatures, changeRsvp, flush, retry };
}
