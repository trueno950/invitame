import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addAnalyticsDays,
  analyticsDayOf,
  analyticsDaysBetween,
  ANALYTICS_DEFAULT_WINDOW_DAYS,
  ANALYTICS_MAX_WINDOW_DAYS,
  ANALYTICS_RETENTION_DAYS,
  InvalidAnalyticsWindowError,
  isAnalyticsDay,
  resolveAnalyticsWindow,
  retainedAnalyticsWindow,
  retentionCutoffDay,
  todayInAnalyticsZone,
} from "./analytics-window";

// The calendar rules of the administrator's analytics (M9 T11; S2, S3, S7, L12). Every instant is explicit, so the
// suite never depends on the wall clock and the Ciudad de México boundary is observed exactly: 06:00 UTC is midnight
// in that zone all year, because Mexico abolished daylight saving time in 2022.

describe("analytics calendar (M9 T11; S2, S3, S7)", () => {
  describe("the Ciudad de México day", () => {
    it("cuts the day at 06:00 UTC, not at UTC midnight", () => {
      assert.equal(analyticsDayOf(new Date("2026-11-28T05:59:59.999Z")), "2026-11-27");
      assert.equal(analyticsDayOf(new Date("2026-11-28T06:00:00.000Z")), "2026-11-28");
      assert.equal(analyticsDayOf(new Date("2026-11-29T05:59:59.999Z")), "2026-11-28");
      assert.equal(analyticsDayOf(new Date("2026-11-29T06:00:00.000Z")), "2026-11-29");
    });

    it("answers today's calendar day in the zone, whatever the host zone is", () => {
      assert.equal(todayInAnalyticsZone(new Date("2026-11-29T02:00:00.000Z")), "2026-11-28");
      assert.equal(todayInAnalyticsZone(new Date("2026-11-29T07:00:00.000Z")), "2026-11-29");
    });
  });

  describe("the accepted day value", () => {
    it("accepts only a real calendar day written as YYYY-MM-DD", () => {
      assert.equal(isAnalyticsDay("2026-11-28"), true);
      assert.equal(isAnalyticsDay("2026-02-28"), true);
      assert.equal(isAnalyticsDay("2026-02-29"), false, "2026 is not a leap year");
      assert.equal(isAnalyticsDay("2026-04-31"), false);
      assert.equal(isAnalyticsDay("2026-13-01"), false);
      assert.equal(isAnalyticsDay("2026-00-10"), false);
      assert.equal(isAnalyticsDay("2026-1-01"), false);
      assert.equal(isAnalyticsDay("28-11-2026"), false);
      assert.equal(isAnalyticsDay("2026-11-28T00:00:00Z"), false);
      assert.equal(isAnalyticsDay(""), false);
      assert.equal(isAnalyticsDay(null), false);
      assert.equal(isAnalyticsDay(20261128), false);
    });
  });

  describe("day arithmetic", () => {
    it("adds and subtracts whole days across a month and a year boundary", () => {
      assert.equal(addAnalyticsDays("2026-11-28", 1), "2026-11-29");
      assert.equal(addAnalyticsDays("2026-11-30", 1), "2026-12-01");
      assert.equal(addAnalyticsDays("2026-12-31", 1), "2027-01-01");
      assert.equal(addAnalyticsDays("2026-03-01", -1), "2026-02-28");
      assert.equal(addAnalyticsDays("2026-11-28", -30), "2026-10-29");
    });

    it("lists every day of a window in ascending order, both ends included", () => {
      assert.deepEqual(analyticsDaysBetween("2026-11-27", "2026-11-30"), [
        "2026-11-27",
        "2026-11-28",
        "2026-11-29",
        "2026-11-30",
      ]);
      assert.deepEqual(analyticsDaysBetween("2026-11-28", "2026-11-28"), ["2026-11-28"]);
      assert.deepEqual(analyticsDaysBetween("2026-11-29", "2026-11-28"), []);
    });
  });

  describe("the accepted window", () => {
    const now = new Date("2026-11-29T02:00:00.000Z"); // 2026-11-28 in Ciudad de México.

    it("defaults to the last thirty days ending today in the zone", () => {
      const window = resolveAnalyticsWindow({ from: null, to: null }, now);

      assert.equal(window.to, "2026-11-28");
      assert.equal(window.from, "2026-10-30");
      assert.equal(window.days.length, ANALYTICS_DEFAULT_WINDOW_DAYS);
      assert.equal(window.days.at(0), "2026-10-30");
      assert.equal(window.days.at(-1), "2026-11-28");
    });

    it("fills a missing bound from the bound the caller did send", () => {
      const endingToday = resolveAnalyticsWindow({ from: "2026-11-01", to: null }, now);
      assert.equal(endingToday.from, "2026-11-01");
      assert.equal(endingToday.to, "2026-11-28");

      const thirtyDaysEndingThere = resolveAnalyticsWindow({ from: null, to: "2026-09-30" }, now);
      assert.equal(thirtyDaysEndingThere.from, "2026-09-01");
      assert.equal(thirtyDaysEndingThere.to, "2026-09-30");
      assert.equal(thirtyDaysEndingThere.days.length, ANALYTICS_DEFAULT_WINDOW_DAYS);
    });

    it("accepts a single day and the widest allowed window", () => {
      const single = resolveAnalyticsWindow({ from: "2026-11-28", to: "2026-11-28" }, now);
      assert.deepEqual(single.days, ["2026-11-28"]);

      const widest = resolveAnalyticsWindow({ from: "2026-08-31", to: "2026-11-28" }, now);
      assert.equal(widest.days.length, ANALYTICS_MAX_WINDOW_DAYS);
      assert.equal(ANALYTICS_MAX_WINDOW_DAYS, 90);
    });

    it("refuses a malformed day, a reversed window, and a window wider than ninety days", () => {
      const refused: Array<{ from: string | null; to: string | null }> = [
        { from: "2026-02-30", to: null },
        { from: null, to: "2026-11-28T00:00:00Z" },
        { from: "28/11/2026", to: "2026-11-28" },
        { from: "2026-11-29", to: "2026-11-28" },
        { from: "2026-11-28", to: "2026-08-30" },
        { from: "2026-08-30", to: "2026-11-28" },
        { from: "2025-01-01", to: null },
      ];

      for (const query of refused) {
        assert.throws(
          () => resolveAnalyticsWindow(query, now),
          InvalidAnalyticsWindowError,
          JSON.stringify(query),
        );
      }
      // The widest window is inclusive of both ends: one day more is refused, so 90 is the count of days, not a gap.
      assert.throws(
        () => resolveAnalyticsWindow({ from: "2026-08-30", to: "2026-11-28" }, now),
        InvalidAnalyticsWindowError,
      );
      assert.equal(
        resolveAnalyticsWindow({ from: "2026-08-31", to: "2026-11-28" }, now).days.length,
        90,
      );
    });
  });

  describe("retention", () => {
    it("names the window the invitation detail sums: the retained days ending today", () => {
      const window = retainedAnalyticsWindow(new Date("2026-11-29T02:00:00.000Z"));

      assert.equal(window.to, "2026-11-28");
      assert.equal(window.from, "2026-08-30");
      assert.equal(window.days.length, ANALYTICS_RETENTION_DAYS + 1);
    });

    it("keeps ninety days of views and drops anything older", () => {
      // 2026-11-28 minus 90 days is 2026-08-30: a row of that day is ninety days old and is kept.
      assert.equal(retentionCutoffDay("2026-11-28"), "2026-08-30");
      assert.equal(retentionCutoffDay("2026-03-01"), "2025-12-01");
      assert.equal(ANALYTICS_RETENTION_DAYS, 90);
    });
  });
});
