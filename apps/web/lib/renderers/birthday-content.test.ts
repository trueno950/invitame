import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type BirthdayContent,
  formatAgeLabel,
  formatLongDate,
  parseBirthdayContent,
} from "./birthday-content.ts";
import { RendererPropsError } from "./renderer-props-error.ts";

// The content of a themed birthday layout (T6b; S2, S8): the three new layouts reuse exactly the eight
// fields of every birthday layout with the same types and rules, so the creator form needs no change.
// The API validates a version before publication; this parse re-reads a stored snapshot defensively, so a
// failure is an operational error and throws, naming every defect at once.

const COMPONENT_KEY = "birthday-map-01";

function content(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    celebrantName: "Mateo",
    age: 7,
    date: "2026-12-05",
    time: "16:30",
    location: "Jardín Los Pinos",
    address: "Calle Reforma 123, Guadalajara",
    mainPhoto: "https://example.com/mateo.jpg",
    message: "Ven a celebrar conmigo.",
    ...overrides,
  };
}

function issuesOf(run: () => unknown): string[] {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof RendererPropsError, `unexpected error: ${String(error)}`);
    return error.issues;
  }
  assert.fail("expected a RendererPropsError");
}

describe("parseBirthdayContent", () => {
  it("returns the eight typed fields of a valid invitation", () => {
    const parsed: BirthdayContent = parseBirthdayContent(COMPONENT_KEY, content());

    assert.deepEqual(parsed, content() as unknown as BirthdayContent);
  });

  it("names the layout whose snapshot it refused", () => {
    assert.throws(() => parseBirthdayContent(COMPONENT_KEY, {}), {
      name: "RendererPropsError",
      message: /^Invalid birthday-map-01 content: /,
    });
  });

  it("names every defective field", () => {
    assert.deepEqual(
      issuesOf(() =>
        parseBirthdayContent(
          COMPONENT_KEY,
          content({
            celebrantName: "  ",
            age: 0,
            date: "2026-02-30",
            time: "25:00",
            location: 7,
            mainPhoto: "ftp://example.com/mateo.jpg",
          }),
        ),
      ),
      [
        "content.celebrantName must be a non-empty string",
        "content.age must be an integer from 1 to 120",
        "content.date must be a calendar date as YYYY-MM-DD",
        "content.time must be a time as HH:MM",
        "content.location must be a non-empty string",
        "content.mainPhoto must be an http or https URL",
      ],
    );
  });

  it("refuses missing fields, non-objects, and ages outside the allowed range", () => {
    const { message: _message, ...withoutMessage } = content();

    assert.deepEqual(
      issuesOf(() => parseBirthdayContent(COMPONENT_KEY, withoutMessage)),
      ["content.message must be a non-empty string"],
    );
    assert.deepEqual(
      issuesOf(() => parseBirthdayContent(COMPONENT_KEY, null)),
      ["content must be a JSON object"],
    );
    assert.deepEqual(
      issuesOf(() => parseBirthdayContent(COMPONENT_KEY, ["Mateo"])),
      ["content must be a JSON object"],
    );
    for (const age of [0, 121, 1.5, "7", null]) {
      assert.deepEqual(
        issuesOf(() => parseBirthdayContent(COMPONENT_KEY, content({ age }))),
        ["content.age must be an integer from 1 to 120"],
      );
    }
  });

  it("does not read inherited keys as content", () => {
    const inherited = Object.create(content()) as Record<string, unknown>;

    assert.deepEqual(
      issuesOf(() => parseBirthdayContent(COMPONENT_KEY, inherited)),
      [
        "content.celebrantName must be a non-empty string",
        "content.age must be an integer from 1 to 120",
        "content.date must be a calendar date as YYYY-MM-DD",
        "content.time must be a time as HH:MM",
        "content.location must be a non-empty string",
        "content.address must be a non-empty string",
        "content.mainPhoto must be an http or https URL",
        "content.message must be a non-empty string",
      ],
    );
  });
});

describe("Spanish formatting", () => {
  it("writes the date in long form", () => {
    assert.equal(formatLongDate("2026-12-05"), "5 de diciembre de 2026");
    assert.equal(formatLongDate("2027-01-01"), "1 de enero de 2027");
    assert.equal(formatLongDate("2026-08-31"), "31 de agosto de 2026");
  });

  it("writes the age label with its singular", () => {
    assert.equal(formatAgeLabel(1), "Cumple 1 año");
    assert.equal(formatAgeLabel(7), "Cumple 7 años");
  });
});
