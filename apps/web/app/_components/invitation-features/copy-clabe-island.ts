"use client";

import { createElement, type ReactElement, useEffect, useRef, useState } from "react";

import {
  GIFT_REGISTRY_COPIED,
  GIFT_REGISTRY_COPY_CLABE,
} from "../../../lib/invitation-features/gift-registry.ts";

/**
 * The «Copiar CLABE» button of a guest invitation (F2; L4.5): the second client island of the shared features block,
 * next to the countdown. A guest who wants to make a transfer copies the number with one tap, and the island never
 * needs the clipboard to be available: when the Clipboard API is missing or refuses, it selects the CLABE's own text so
 * the guest can copy it by hand, which is the fallback the design asks for.
 *
 * The confirmation is a visible text change — the button's own label becomes «¡Copiada!» and a status line says it too —
 * so it never relies on color alone, and a screen reader hears it once through the polite live region. The label goes
 * back to normal after a few seconds, so the button is ready for another copy.
 */

/** How long the confirmation stays on screen, in milliseconds. */
const CONFIRMATION_MS = 4000;

export interface CopyClabeIslandProps {
  /** The compact CLABE the button copies: eighteen digits and nothing else. */
  readonly clabe: string;
  /** The id of the element that shows the grouped CLABE, which the fallback selects. */
  readonly clabeId: string;
}

/** Select the CLABE text on screen, so the guest can press the browser's own copy command. */
function selectClabe(clabeId: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const element = document.getElementById(clabeId);

  if (element === null) {
    return false;
  }

  const selection = window.getSelection();

  if (selection === null) {
    return false;
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

/** The button's visible confirmation, and the status line that repeats it for a reader that cannot see it. */
export function CopyClabeIsland({ clabe, clabeId }: CopyClabeIslandProps): ReactElement {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      if (timer.current !== undefined) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  const confirm = (): void => {
    setCopied(true);

    if (timer.current !== undefined) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setCopied(false), CONFIRMATION_MS);
  };

  const copy = async (): Promise<void> => {
    try {
      if (navigator.clipboard !== undefined) {
        await navigator.clipboard.writeText(clabe);
        confirm();
        return;
      }
    } catch {
      // The API is present but refused: the selected text is the fallback, exactly like a missing API.
    }

    if (selectClabe(clabeId)) {
      confirm();
    }
  };

  return createElement(
    "div",
    { "data-copy-clabe": clabe },
    createElement(
      "button",
      {
        type: "button",
        onClick: () => void copy(),
        "aria-describedby": `${clabeId}-status`,
        className:
          "mt-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border-[1.5px] border-(--inv-accent) px-5 text-sm font-medium text-(color:--inv-accent)",
      },
      copied ? GIFT_REGISTRY_COPIED : GIFT_REGISTRY_COPY_CLABE,
    ),
    createElement(
      "p",
      {
        id: `${clabeId}-status`,
        role: "status",
        "aria-live": "polite",
        className: "mt-2 text-sm text-(color:--inv-ink)",
      },
      copied ? GIFT_REGISTRY_COPIED : "",
    ),
  );
}
