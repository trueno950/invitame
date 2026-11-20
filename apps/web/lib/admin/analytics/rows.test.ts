import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { invitationDetailPath } from "../invitations/copy.ts";
import { ANALYTICS_COPY, INVITATION_ANALYTICS_COPY } from "./copy.ts";
import {
  formatAnalyticsCount,
  formatAnalyticsDay,
  funnelDayRows,
  funnelTotals,
  invitationActivityView,
  topInvitationRows,
  viewsDayRows,
  viewsTotals,
} from "./rows.ts";

// What `/admin/analitica` and the aperturas card of one invitation render (M9 T12; S2, S7). The tables show the days
// the API answered with the numbers formatted for reading, a totals row for the whole window, and the top invitations
// linked to their detail. Every count is an «apertura», never a person: the copy has no word for a visitor (S7, L12).

const INVITATION_ID = "1b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e11";
const OTHER_ID = "2b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e12";

describe("formatAnalyticsDay", () => {
  it("writes a stored day as a short Spanish date", () => {
    assert.equal(formatAnalyticsDay("2026-11-10"), "10 nov 2026");
    assert.equal(formatAnalyticsDay("2027-01-01"), "1 ene 2027");
  });

  it("answers an empty text for a day it cannot read", () => {
    for (const day of ["", "ayer", "2026-02-30", "2026-11-10T00:00:00Z"]) {
      assert.equal(formatAnalyticsDay(day), "", day);
    }
  });
});

describe("formatAnalyticsCount", () => {
  it("groups thousands as Spanish reads them", () => {
    assert.equal(formatAnalyticsCount(0), "0");
    assert.equal(formatAnalyticsCount(9), "9");
    assert.equal(formatAnalyticsCount(1234), "1,234");
    assert.equal(formatAnalyticsCount(1234567), "1,234,567");
  });
});

describe("the views table", () => {
  it("totals the window, counting public and guest links together and separately", () => {
    assert.deepEqual(
      viewsTotals([
        { day: "2026-11-10", public: 12, guest: 3 },
        { day: "2026-11-11", public: 20, guest: 0 },
      ]),
      { public: 32, guest: 3, total: 35 },
    );
  });

  it("totals an empty window as zero instead of failing", () => {
    assert.deepEqual(viewsTotals([]), { public: 0, guest: 0, total: 0 });
  });

  it("shows one row per day, oldest first, with the numbers formatted", () => {
    const rows = viewsDayRows([
      { day: "2026-11-11", public: 1234, guest: 0 },
      { day: "2026-11-10", public: 2, guest: 1 },
    ]);

    assert.deepEqual(rows, [
      { day: "2026-11-10", label: "10 nov 2026", public: "2", guest: "1", total: "3" },
      { day: "2026-11-11", label: "11 nov 2026", public: "1,234", guest: "0", total: "1,234" },
    ]);
  });

  it("keeps every row of an empty window out of the table", () => {
    assert.deepEqual(viewsDayRows([]), []);
  });
});

describe("the top invitations table", () => {
  it("links each invitation to its status detail", () => {
    assert.deepEqual(
      topInvitationRows([
        { invitationId: INVITATION_ID, slug: "ana-y-daniel", public: 9, guest: 2 },
        { invitationId: OTHER_ID, slug: "luis-y-maria", public: 4, guest: 1 },
      ]),
      [
        {
          invitationId: INVITATION_ID,
          href: invitationDetailPath(INVITATION_ID),
          slug: "ana-y-daniel",
          public: "9",
          guest: "2",
          total: "11",
        },
        {
          invitationId: OTHER_ID,
          href: invitationDetailPath(OTHER_ID),
          slug: "luis-y-maria",
          public: "4",
          guest: "1",
          total: "5",
        },
      ],
    );
    assert.equal(topInvitationRows([]).length, 0);
  });

  it("shows no invitation at all when the API answered none", () => {
    assert.deepEqual(topInvitationRows([]), []);
  });
});

describe("the funnel table", () => {
  it("totals every step of the window", () => {
    assert.deepEqual(
      funnelTotals([
        {
          day: "2026-11-10",
          draftsCreated: 3,
          checkoutsStarted: 2,
          paymentsApproved: 1,
          firstPublications: 1,
        },
        {
          day: "2026-11-11",
          draftsCreated: 5,
          checkoutsStarted: 0,
          paymentsApproved: 2,
          firstPublications: 0,
        },
      ]),
      {
        draftsCreated: 8,
        checkoutsStarted: 2,
        paymentsApproved: 3,
        firstPublications: 1,
      },
    );
  });

  it("totals an empty window as zero and shows no rows", () => {
    assert.deepEqual(funnelTotals([]), {
      draftsCreated: 0,
      checkoutsStarted: 0,
      paymentsApproved: 0,
      firstPublications: 0,
    });
    assert.deepEqual(funnelDayRows([]), []);
  });

  it("shows one row per day, oldest first, with the numbers formatted", () => {
    assert.deepEqual(
      funnelDayRows([
        {
          day: "2026-11-11",
          draftsCreated: 1234,
          checkoutsStarted: 0,
          paymentsApproved: 2,
          firstPublications: 1,
        },
        {
          day: "2026-11-10",
          draftsCreated: 3,
          checkoutsStarted: 2,
          paymentsApproved: 1,
          firstPublications: 1,
        },
      ]),
      [
        {
          day: "2026-11-10",
          label: "10 nov 2026",
          draftsCreated: "3",
          checkoutsStarted: "2",
          paymentsApproved: "1",
          firstPublications: "1",
        },
        {
          day: "2026-11-11",
          label: "11 nov 2026",
          draftsCreated: "1,234",
          checkoutsStarted: "0",
          paymentsApproved: "2",
          firstPublications: "1",
        },
      ],
    );
  });
});

describe("invitationActivityView", () => {
  it("states the aperturas of the last 90 days and the RSVP totals", () => {
    assert.deepEqual(
      invitationActivityView(
        { public: 12, guest: 3 },
        { attendingPeople: 48, declined: 9, responses: 21 },
      ),
      {
        views: [
          { label: INVITATION_ANALYTICS_COPY.publicLabel, value: "12" },
          { label: INVITATION_ANALYTICS_COPY.guestLabel, value: "3" },
        ],
        rsvp: [
          { label: INVITATION_ANALYTICS_COPY.attendingLabel, value: "48" },
          { label: INVITATION_ANALYTICS_COPY.declinedLabel, value: "9" },
          { label: INVITATION_ANALYTICS_COPY.responsesLabel, value: "21" },
        ],
      },
    );
  });

  it("formats large counts and shows zeros instead of hiding them", () => {
    const view = invitationActivityView(
      { public: 0, guest: 0 },
      { attendingPeople: 0, declined: 0, responses: 0 },
    );

    assert.deepEqual(view.views, [
      { label: INVITATION_ANALYTICS_COPY.publicLabel, value: "0" },
      { label: INVITATION_ANALYTICS_COPY.guestLabel, value: "0" },
    ]);
    assert.deepEqual(view.rsvp, [
      { label: INVITATION_ANALYTICS_COPY.attendingLabel, value: "0" },
      { label: INVITATION_ANALYTICS_COPY.declinedLabel, value: "0" },
      { label: INVITATION_ANALYTICS_COPY.responsesLabel, value: "0" },
    ]);
  });
});

describe("the analytics copy", () => {
  it("says «aperturas» and never a person or a unique visitor", () => {
    const text = [...Object.values(ANALYTICS_COPY), ...Object.values(INVITATION_ANALYTICS_COPY)]
      .filter((value) => typeof value === "string")
      .join("\n")
      .toLowerCase();

    assert.match(text, /apertura/);
    for (const forbidden of ["persona", "visitante", "usuario único", "usuarios únicos"]) {
      assert.equal(text.includes(forbidden), false, forbidden);
    }
  });

  it("says that a reload and the owner's own visit count", () => {
    assert.match(ANALYTICS_COPY.viewsIntro, /recarga/u);
    assert.match(ANALYTICS_COPY.viewsIntro, /dueñ/u);
  });
});
