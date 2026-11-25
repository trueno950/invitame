"use client";

import type { KeyboardEvent } from "react";
import { useRef } from "react";

import { EDITOR_COPY } from "../../../../../lib/customer/copy.ts";
import type { EditorSection } from "../../../../../lib/customer/editor-sections.ts";
import { focusRing } from "../../../../_components/ui.ts";

/**
 * The two tab lists of the editor (T2c; S3, S4). The same five tabs are a rail beside the form on a wide screen and a
 * horizontal row above it on a phone, so the editor carries two lists and shows exactly one of them at a time; the
 * hidden one never reaches the accessibility tree, because its `display` is `none`.
 *
 * They are real tabs, not links: `role="tab"` inside a `role="tablist"`, `aria-selected` on the open one, and a
 * roving `tabindex` so the list is one stop for the keyboard and the arrow keys, Home, and End move between its tabs.
 * The tab is client state and never a navigation (S2): switching tabs saves nothing, sends nothing, and keeps every
 * value the owner typed in the other tabs.
 */

/** One tab as the editor renders it: the section it opens, its label, and what it still owes. */
export interface EditorTabView {
  readonly section: EditorSection;
  /** The tab's accessible name, with its progress: «Contenido · 4 de 12» (S4; T1). */
  readonly label: string;
  /** The short count the rail shows beside the name, or "" when the tab has nothing to count. */
  readonly meta: string;
}

// The idle and the selected tab are separate class strings instead of one plus an override: two Tailwind color
// utilities on the same element are resolved by the stylesheet's order, not by the order they are written in, so
// stacking `text-ink` and `text-on-primary` would leave the selected label unreadable.
const railTab = `flex min-h-11.5 w-full items-center justify-between gap-2 rounded-[0.875rem] px-3 text-left text-sm tracking-[0.01em] transition-colors ${focusRing}`;
const railIdle = "font-medium text-ink hover:bg-surface";
const railSelected =
  "bg-surface font-semibold text-primary shadow-[inset_3px_0_0_var(--color-primary),var(--shadow-soft)] ring-[1.5px] ring-rose-100";

const rowTab = `inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors ring-[1.5px] ${focusRing}`;
const rowIdle = "bg-surface text-ink ring-field-border hover:bg-rose-50";
const rowSelected = "bg-primary text-on-primary ring-primary hover:bg-primary-deep";

const railMeta = "text-[0.7rem] font-normal whitespace-nowrap text-muted";

/** The key a tab press moves to, or nothing when the key is not one of the list's own. */
function nextIndex(key: string, index: number, count: number): number | undefined {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return undefined;
  }
}

export function EditorTabList({
  tabs,
  active,
  layout,
  idPrefix,
  panelId,
  onSelect,
  className,
}: {
  tabs: readonly EditorTabView[];
  active: EditorSection;
  /** `rail` is the vertical list beside the form; `row` is the horizontal one above it on a phone. */
  layout: "rail" | "row";
  /** Makes each list's tab ids unique, because both lists exist in the same document. */
  idPrefix: string;
  panelId: string;
  onSelect: (section: EditorSection) => void;
  className?: string;
}) {
  const list = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.section === active);
    const next = nextIndex(event.key, index === -1 ? 0 : index, tabs.length);

    if (next === undefined) {
      return;
    }

    event.preventDefault();
    const section = tabs[next]?.section;

    if (section === undefined) {
      return;
    }
    onSelect(section);
    list.current?.querySelector<HTMLButtonElement>(`[data-editor-tab="${section}"]`)?.focus();
  };

  return (
    <div
      aria-label={EDITOR_COPY.tabListLabel}
      aria-orientation={layout === "rail" ? "vertical" : "horizontal"}
      className={`${layout === "rail" ? "flex flex-col gap-0.5" : "flex flex-wrap gap-2"} ${className ?? ""}`}
      onKeyDown={onKeyDown}
      ref={list}
      role="tablist"
    >
      {tabs.map((tab) => {
        const selected = tab.section === active;

        return (
          <button
            aria-controls={panelId}
            aria-label={tab.label}
            aria-selected={selected}
            className={
              layout === "rail"
                ? `${railTab} ${selected ? railSelected : railIdle}`
                : `${rowTab} ${selected ? rowSelected : rowIdle}`
            }
            data-editor-tab={tab.section}
            id={`${idPrefix}-${tab.section}`}
            key={tab.section}
            onClick={() => onSelect(tab.section)}
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            <span className="whitespace-nowrap">
              {layout === "row" ? tab.label : EDITOR_COPY.tabs[tab.section]}
            </span>
            {layout === "rail" && tab.meta !== "" ? (
              <span aria-hidden="true" className={railMeta}>
                {tab.meta}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
