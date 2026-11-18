"use client";

import { useEffect, useRef } from "react";

import { EDITOR_COPY } from "../../../../../lib/customer/copy.ts";
import { focusRing, quietButton } from "../../../../_components/ui.ts";

/**
 * The live preview of the invitation (T2b, T2c; S3, S4). The owner's preview route renders the stored draft through
 * the same renderer a guest sees, and the editor frames it: beside the fields on a wide screen, and full screen in an
 * accessible dialog on a phone.
 *
 * The frame reloads only after a save the API accepted — the editor bumps its key, the document is read again, and the
 * preview therefore never shows data the API has not stored. The editor never calls `router.refresh()` for a save: it
 * would re-render the server page under the fields the owner is typing in.
 */

/**
 * One phone-width frame of the preview: the caller sets its width and height, so the pane beside the fields and the
 * dialog can each own its own size without two Tailwind width utilities fighting on one element. Its key is the
 * reload: a new key mounts a new document, which is how the editor shows what the API just stored.
 */
export function PreviewFrame({
  src,
  reloadKey,
  className,
}: {
  src: string;
  reloadKey: number;
  className?: string;
}) {
  return (
    <iframe
      className={`w-full border-0 bg-background ${className ?? ""}`}
      key={reloadKey}
      src={src}
      title={EDITOR_COPY.previewFrameTitle}
    />
  );
}

/**
 * The phone's way to the preview: a modal `<dialog>`, so the browser owns the focus trap, the Escape key, and the
 * focus that comes back to the trigger when it closes. It is only mounted while it is open, so the invitation is read
 * once per opening, and its own close button is always reachable.
 */
export function PreviewDialog({
  open,
  onClose,
  src,
  reloadKey,
}: {
  open: boolean;
  onClose: () => void;
  src: string;
  reloadKey: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = "editor-preview-title";

  useEffect(() => {
    const element = dialog.current;

    if (element === null) {
      return;
    }
    if (open && !element.open) {
      element.showModal();
    }
    if (!open && element.open) {
      element.close();
    }
  }, [open]);

  return (
    <dialog
      aria-labelledby={titleId}
      className="m-0 h-[100dvh] max-h-none w-screen max-w-none bg-surface p-0 backdrop:bg-ink/45"
      onClose={onClose}
      ref={dialog}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-rose-100 px-4 py-3">
          <h2 className="min-w-0 font-display text-lg font-semibold text-ink" id={titleId}>
            {EDITOR_COPY.previewFrameTitle}
          </h2>
          <button className={`${quietButton} ${focusRing}`} onClick={onClose} type="button">
            {EDITOR_COPY.previewClose}
          </button>
        </div>
        <div className="min-h-0 flex-1">
          {open ? <PreviewFrame className="h-full" reloadKey={reloadKey} src={src} /> : null}
        </div>
      </div>
    </dialog>
  );
}
