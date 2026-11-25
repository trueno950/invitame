import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EDITOR_COPY, INVITATION_COPY } from "./copy.ts";
import {
  EDITOR_FIELD_PARAM,
  editorProgress,
  fieldFocus,
  fieldFromSearch,
  invitationHeading,
  missingFieldHref,
  nextStepLabel,
  parseEditorField,
  progressMeta,
  stepStateLabel,
} from "./editor-progress.ts";

// The guidance of the invitation editor (T1; S2.1, S2.4, S2.5, S3): the three first steps and their progress, the next
// step the phone's bar offers, the name of the invitation in the heading, and the link that opens one missing field.
// Every decision is pure, so `node --test` proves it without a browser; the count of «N de M listos» is the count of
// `missingRequiredNames`, so the progress and the «faltan N» it replaced never disagree.

/** The same progress for a template whose required fields are all filled. */
const COMPLETE = { required: 12, missing: 0, photoCount: 1, published: false } as const;

/** The same progress with nothing filled but the photo, which is where a fresh draft starts. */
const STARTING = { required: 12, missing: 12, photoCount: 0, published: false } as const;

describe("progressMeta", () => {
  it("states how much of the tab is done, and nothing when the template requires nothing", () => {
    assert.equal(progressMeta(4, 12), "4 de 12");
    assert.equal(progressMeta(12, 12), "12 de 12");
    assert.equal(progressMeta(0, 0), "");
    // A count that cannot come from the schema still never goes below zero.
    assert.equal(progressMeta(-1, 12), "0 de 12");
  });
});

describe("editorProgress", () => {
  it("counts «N de M listos» with the rule the «faltan N» chip used", () => {
    const progress = editorProgress({ required: 12, missing: 3, photoCount: 0, published: false });

    assert.equal(progress.done, 9);
    assert.equal(progress.total, 12);
    assert.equal(progress.label, EDITOR_COPY.firstSteps.progress(9, 12));
    assert.match(progress.label, /^9 de 12 listos$/);
    assert.equal(progress.percent, 75);
  });

  it("marks every step done and names no next step once it is published", () => {
    const progress = editorProgress({ ...COMPLETE, published: true });

    assert.deepEqual(
      progress.steps.map((step) => step.state),
      ["done", "done", "done"],
    );
    assert.equal(progress.next, undefined);
    assert.equal(progress.label, "12 de 12 listos");
  });

  it("keeps «Completa tus datos» current while a required field is empty", () => {
    const progress = editorProgress({ ...STARTING, missing: 2 });

    assert.equal(progress.steps[0]?.key, "datos");
    assert.equal(progress.steps[0]?.state, "current");
    assert.equal(progress.steps[1]?.state, "pending");
    assert.equal(progress.steps[2]?.state, "pending");
    assert.equal(progress.next?.section, "contenido");
  });

  it("asks for photos once the data is complete, and for the publication once the photos are there", () => {
    const photos = editorProgress({ ...COMPLETE, photoCount: 0 });

    assert.deepEqual(
      photos.steps.map((step) => step.state),
      ["done", "current", "pending"],
    );
    assert.equal(photos.next?.section, "fotos");
    assert.equal(nextStepLabel(photos.next?.section ?? "fotos"), "Siguiente: Fotos");

    const publication = editorProgress(COMPLETE);

    assert.deepEqual(
      publication.steps.map((step) => step.state),
      ["done", "done", "current"],
    );
    assert.equal(publication.next?.section, "publicar");
    assert.equal(nextStepLabel("publicar"), "Publicar");
  });

  it("counts the main photo as a photo, so the photo step is done with one of them", () => {
    // The page counts the main photo and the gallery in one number: one of them is enough for the step.
    assert.equal(
      editorProgress({ ...STARTING, missing: 12, photoCount: 0 }).steps[1]?.state,
      "pending",
    );
    assert.equal(
      editorProgress({ ...STARTING, missing: 12, photoCount: 1 }).steps[1]?.state,
      "done",
    );
  });

  it("never asks for data a template does not require", () => {
    const progress = editorProgress({ required: 0, missing: 0, photoCount: 0, published: false });

    assert.equal(progress.label, EDITOR_COPY.firstSteps.progressEmpty);
    assert.equal(progress.percent, 100);
    assert.equal(progress.steps[0]?.state, "done");
    assert.equal(progress.next?.section, "fotos");
  });

  it("writes each step's state in words, so the state is never only a color", () => {
    assert.equal(stepStateLabel("done"), EDITOR_COPY.firstSteps.stateDone);
    assert.equal(stepStateLabel("current"), EDITOR_COPY.firstSteps.stateCurrent);
    assert.equal(stepStateLabel("pending"), EDITOR_COPY.firstSteps.statePending);
    assert.equal(stepStateLabel("done"), "Listo");
    assert.equal(stepStateLabel("current"), "Ahora");
    assert.equal(stepStateLabel("pending"), "Después");
    for (const step of editorProgress({ ...COMPLETE, photoCount: 0 }).steps) {
      assert.ok(stepStateLabel(step.state).length > 0);
    }
  });

  it("offers each step as a link to its own tab", () => {
    const progress = editorProgress(STARTING);

    assert.deepEqual(
      progress.steps.map((step) => step.section),
      ["contenido", "fotos", "publicar"],
    );
    assert.deepEqual(
      progress.steps.map((step) => step.title),
      [
        EDITOR_COPY.firstSteps.content,
        EDITOR_COPY.firstSteps.photos,
        EDITOR_COPY.firstSteps.publish,
      ],
    );
  });
});

describe("missing field links", () => {
  it("opens the Contenido tab with the field it names", () => {
    assert.equal(
      missingFieldHref("/cuenta/invitaciones/abc", "celebrantName"),
      `/cuenta/invitaciones/abc?seccion=contenido&${EDITOR_FIELD_PARAM}=celebrantName`,
    );
  });

  it("keeps the parameters a page already carried, and its fragment", () => {
    assert.equal(
      missingFieldHref("/cuenta/invitaciones/abc?notice=saved", "date"),
      `/cuenta/invitaciones/abc?notice=saved&seccion=contenido&${EDITOR_FIELD_PARAM}=date`,
    );
    assert.equal(
      missingFieldHref("/cuenta/invitaciones/abc#panel", "date"),
      `/cuenta/invitaciones/abc?seccion=contenido&${EDITOR_FIELD_PARAM}=date#panel`,
    );
  });

  it("reads the field of a query, and refuses everything that is not a property name", () => {
    assert.equal(
      fieldFromSearch(`?seccion=contenido&${EDITOR_FIELD_PARAM}=coupleNameOne`),
      "coupleNameOne",
    );
    assert.equal(fieldFromSearch("?seccion=contenido"), undefined);
    assert.equal(fieldFromSearch(""), undefined);
    assert.equal(parseEditorField(["date", "time"]), undefined);
    assert.equal(parseEditorField("date;drop"), undefined);
    assert.equal(parseEditorField(""), undefined);
    assert.equal(parseEditorField("1date"), undefined);
    assert.equal(parseEditorField(undefined), undefined);
  });
});

describe("fieldFocus", () => {
  it("asks the same field again with a new nonce, so a second click focuses it again", () => {
    const first = fieldFocus("date");

    assert.deepEqual(first, { field: "date", nonce: 0 });
    assert.deepEqual(fieldFocus("date", first), { field: "date", nonce: 1 });
    assert.deepEqual(fieldFocus("time", first), { field: "time", nonce: 0 });
  });
});

describe("invitationHeading", () => {
  it("names the celebrant, the baby, the couple, or the hosts the invitation is about", () => {
    assert.equal(invitationHeading({ celebrantName: "Ana" }, undefined), "Ana");
    assert.equal(invitationHeading({ babyName: "Emilia" }, undefined), "Emilia");
    assert.equal(
      invitationHeading({ coupleNameOne: "Ana", coupleNameTwo: "Beto" }, undefined),
      "Ana y Beto",
    );
    assert.equal(invitationHeading({ hosts: "Familia Ruiz" }, undefined), "Familia Ruiz");
  });

  it("names the occasion when the content has no name yet, and the template's own title last", () => {
    assert.equal(invitationHeading({}, "Boda"), INVITATION_COPY.invitationOf("boda"));
    assert.equal(invitationHeading({}, "Boda"), "Tu invitación de boda");
    assert.equal(invitationHeading({}, "Baby shower"), "Tu invitación de baby shower");
    // An initialism keeps its capitals: only a capitalized ordinary word is lowered.
    assert.equal(invitationHeading({}, "XV años"), "Tu invitación de XV años");
    assert.equal(invitationHeading({}, undefined), INVITATION_COPY.detailHeading);
    assert.equal(invitationHeading({}, ""), INVITATION_COPY.detailHeading);
  });

  it("ignores a name that is only whitespace and one that is not text", () => {
    assert.equal(
      invitationHeading({ celebrantName: "   " }, "Bautizo"),
      INVITATION_COPY.invitationOf("bautizo"),
    );
    assert.equal(
      invitationHeading({ celebrantName: 7 }, "Bautizo"),
      INVITATION_COPY.invitationOf("bautizo"),
    );
    assert.equal(invitationHeading({ celebrantName: " Ana " }, undefined), "Ana");
  });

  it("announces only the couple names that are both present", () => {
    assert.equal(
      invitationHeading({ coupleNameOne: "Ana" }, "Boda"),
      INVITATION_COPY.invitationOf("boda"),
    );
  });
});

describe("nextStepLabel", () => {
  it("names the tab of the step that comes next, and «Publicar» for the publication itself", () => {
    assert.equal(nextStepLabel("contenido"), "Siguiente: Contenido");
    assert.equal(nextStepLabel("fotos"), "Siguiente: Fotos");
    assert.equal(nextStepLabel("publicar"), "Publicar");
    assert.equal(nextStepLabel("funciones"), "Siguiente: Funciones");
  });
});
