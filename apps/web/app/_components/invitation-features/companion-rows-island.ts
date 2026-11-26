"use client";

import { useEffect } from "react";

/**
 * The progressive enhancement of the companion rows (F3; L6.3). The rows are server-rendered up to the party limit and
 * carry no client state at all, so the form works with no JavaScript: without this island every row is visible and
 * enabled, and the submitted answer keeps only the rows the party the guest chose covers.
 *
 * When React hydrates, this island reads the party select and shows exactly the rows the chosen party needs, hiding and
 * disabling the rest so a guest never types into a row their party does not cover. Toggling back brings the rows back
 * empty, and nothing here ever changes the party itself: the select stays the only source of the count.
 */

export interface CompanionRowsIslandProps {
  /** The id of the party `<select>` the rows follow. */
  readonly selectId: string;
  /** The id of the element that holds the companion rows. */
  readonly rowsId: string;
}

/** The rows one party of `party` people covers: everyone who comes with the guest. */
function coveredRows(party: number): number {
  return Number.isFinite(party) ? Math.max(Math.trunc(party) - 1, 0) : 0;
}

export function CompanionRowsIsland({ selectId, rowsId }: CompanionRowsIslandProps): null {
  useEffect(() => {
    const select = document.getElementById(selectId);
    const rows = document.getElementById(rowsId);

    if (!(select instanceof HTMLSelectElement) || rows === null) {
      return;
    }

    const apply = (): void => {
      const covered = coveredRows(Number(select.value));

      for (const row of rows.querySelectorAll<HTMLElement>("[data-companion-row]")) {
        const index = Number(row.dataset.companionRow ?? "");
        const hidden = !Number.isFinite(index) || index > covered;

        row.hidden = hidden;
        for (const field of row.querySelectorAll<HTMLInputElement>("input")) {
          field.disabled = hidden;
        }
      }
    };

    apply();
    select.addEventListener("change", apply);

    return () => {
      select.removeEventListener("change", apply);
    };
  }, [rowsId, selectId]);

  // Nothing to draw: the rows themselves are the server's markup.
  return null;
}
