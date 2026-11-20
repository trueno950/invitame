import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isAnalyticsWindow } from "../../server/admin-analytics-client.ts";
import { defaultAnalyticsPeriod, parseAnalyticsPeriod } from "./search.ts";

// The window of `/admin/analitica` (M9 T12; S2, S3, S7). The page validates its own query before anything reaches the
// API: `desde` and `hasta` are real calendar days, in order, and at most 90 days apart. Anything else — a missing half,
// a repeated parameter, an impossible date, a window of 91 days — falls back to the default window of the last 30 days,
// and only the fallback is ever sent. The default window ends on today in `America/Mexico_City`, because that is the day
// the API cuts its rows in (S7, L12).

/** Noon in Mexico City on 2026-11-20 (18:00 UTC), so the local day and the UTC day agree. */
const NOW = new Date("2026-11-20T18:00:00.000Z");

describe("defaultAnalyticsPeriod", () => {
  it("is the last 30 days, ending on today in Mexico City", () => {
    assert.deepEqual(defaultAnalyticsPeriod(NOW), {
      from: "2026-10-22",
      to: "2026-11-20",
      isDefault: true,
    });
  });

  it("ends on the Mexico City day, not the UTC one", () => {
    // 2026-11-20T05:00:00Z is still 2026-11-19 in Mexico City (UTC-6), so the window ends a day earlier.
    assert.deepEqual(defaultAnalyticsPeriod(new Date("2026-11-20T05:00:00.000Z")), {
      from: "2026-10-21",
      to: "2026-11-19",
      isDefault: true,
    });
  });

  it("crosses a month and a year boundary", () => {
    assert.deepEqual(defaultAnalyticsPeriod(new Date("2027-01-10T18:00:00.000Z")), {
      from: "2026-12-12",
      to: "2027-01-10",
      isDefault: true,
    });
  });
});

describe("parseAnalyticsPeriod", () => {
  it("keeps a valid window the page's query named", () => {
    assert.deepEqual(parseAnalyticsPeriod({ desde: "2026-11-01", hasta: "2026-11-30" }, NOW), {
      from: "2026-11-01",
      to: "2026-11-30",
      isDefault: false,
    });
  });

  it("accepts one day and a window of exactly 90 days", () => {
    assert.deepEqual(parseAnalyticsPeriod({ desde: "2026-11-20", hasta: "2026-11-20" }, NOW), {
      from: "2026-11-20",
      to: "2026-11-20",
      isDefault: false,
    });

    // 2026-01-01 to 2026-03-31 is 31 + 28 + 31 = 90 days, the widest window the API serves (S3).
    assert.deepEqual(parseAnalyticsPeriod({ desde: "2026-01-01", hasta: "2026-03-31" }, NOW), {
      from: "2026-01-01",
      to: "2026-03-31",
      isDefault: false,
    });
  });

  it("falls back to the default window when the query names no window at all", () => {
    for (const parameters of [{}, { desde: "2026-11-01" }, { hasta: "2026-11-30" }]) {
      assert.deepEqual(parseAnalyticsPeriod(parameters, NOW), defaultAnalyticsPeriod(NOW));
    }
  });

  it("falls back to the default window for anything that is not a bounded, ordered window", () => {
    const queries: Array<Record<string, string | string[] | undefined>> = [
      // A day the page cannot read: an impossible date, another format, an instant, or a value that is not a day.
      { desde: "2026-02-30", hasta: "2026-03-01" },
      { desde: "2026-13-01", hasta: "2026-12-31" },
      { desde: "1/11/2026", hasta: "30/11/2026" },
      { desde: "2026-11-01T00:00:00Z", hasta: "2026-11-30" },
      { desde: "", hasta: "" },
      { desde: "2026-11-01 ", hasta: "2026-11-30" },
      // A window that ends before it starts.
      { desde: "2026-11-30", hasta: "2026-11-01" },
      // A window of 91 days, one more than the API serves (S3).
      { desde: "2026-01-01", hasta: "2026-04-01" },
      // A repeated parameter is not a value the page offered.
      { desde: ["2026-11-01", "2026-11-02"], hasta: "2026-11-30" },
      { desde: "2026-11-01", hasta: ["2026-11-30", "2026-12-01"] },
    ];

    for (const parameters of queries) {
      assert.deepEqual(
        parseAnalyticsPeriod(parameters, NOW),
        defaultAnalyticsPeriod(NOW),
        JSON.stringify(parameters),
      );
    }
  });

  it("never returns a window it would refuse to send", () => {
    const queries: Array<Record<string, string | string[] | undefined>> = [
      {},
      { desde: "2026-11-01", hasta: "2026-11-30" },
      { desde: "2026-02-30", hasta: "2026-12-31" },
      { desde: "2026-01-01", hasta: "2027-01-01" },
      { desde: ["2026-11-01"], hasta: ["2026-11-02"] },
      { desde: "2026-11-10", hasta: "2026-11-10" },
    ];

    for (const parameters of queries) {
      const period = parseAnalyticsPeriod(parameters, NOW);
      assert.equal(isAnalyticsWindow(period.from, period.to), true, JSON.stringify(parameters));
    }
  });
});
