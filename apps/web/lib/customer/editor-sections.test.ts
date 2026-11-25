import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EDITOR_COPY } from "./copy.ts";
import {
  attendanceTab,
  DEFAULT_EDITOR_SECTION,
  EDITOR_SECTION_PARAM,
  EDITOR_SECTIONS,
  editorSectionTarget,
  editorSnapshotKey,
  missingRequiredNames,
  parseEditorSection,
  sectionFromForm,
  sectionFromSearch,
  sectionTabLabel,
} from "./editor-sections.ts";
import type { ContentField } from "./invitations.ts";

// The tab model of the invitation editor (T2c; S1-S4): which tabs exist, which one the URL names, where a
// navigation comes back to, and what each tab still owes before the invitation can publish. Every decision is
// pure, so `node --test` proves it without a browser.

/** One field of a template schema, as the editor renders it. */
function field(name: string, required: boolean): ContentField {
  return {
    name,
    type: "string",
    label: name,
    required,
    input: { kind: "text", maxLength: 120 },
  };
}

describe("parseEditorSection", () => {
  it("reads each of the five tabs by its own name", () => {
    for (const section of EDITOR_SECTIONS) {
      assert.equal(parseEditorSection(section), section);
    }
  });

  it("falls back to the first tab for a value that names no tab", () => {
    assert.equal(parseEditorSection(undefined), "contenido");
    assert.equal(parseEditorSection(""), "contenido");
    assert.equal(parseEditorSection("funcionalidades"), "contenido");
    assert.equal(parseEditorSection("Contenido"), "contenido");
    // A repeated parameter names no tab, exactly as the chooser's own query refuses one.
    assert.equal(parseEditorSection(["fotos", "publicar"]), DEFAULT_EDITOR_SECTION);
  });

  it("reads the tab of a query string, with or without other parameters", () => {
    assert.equal(sectionFromSearch(""), DEFAULT_EDITOR_SECTION);
    assert.equal(sectionFromSearch("?notice=saved"), DEFAULT_EDITOR_SECTION);
    assert.equal(sectionFromSearch("?notice=saved&seccion=fotos"), "fotos");
    assert.equal(sectionFromSearch(`?${EDITOR_SECTION_PARAM}=asistencia`), "asistencia");
    assert.equal(sectionFromSearch("?seccion=nada"), DEFAULT_EDITOR_SECTION);
  });

  it("reads the tab a submitted form carried, and nothing when it carried none", () => {
    const withSection = new FormData();
    withSection.set(EDITOR_SECTION_PARAM, "funciones");
    assert.equal(sectionFromForm(withSection), "funciones");

    const unknown = new FormData();
    unknown.set(EDITOR_SECTION_PARAM, "otra-cosa");
    assert.equal(sectionFromForm(unknown), undefined);
    assert.equal(sectionFromForm(new FormData()), undefined);
  });
});

describe("editorSectionTarget", () => {
  const PATH = "/cuenta/invitaciones/0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";

  it("adds the tab to the redirect of a navigation so the editor comes back to it", () => {
    assert.equal(`${PATH}?seccion=fotos`, editorSectionTarget(PATH, "fotos"));
    assert.equal(
      `${PATH}?notice=photo-uploaded&seccion=fotos`,
      editorSectionTarget(`${PATH}?notice=photo-uploaded`, "fotos"),
    );
    assert.equal(
      `${PATH}?error=not-publishable&issues=field:date&seccion=publicar`,
      editorSectionTarget(`${PATH}?error=not-publishable&issues=field:date`, "publicar"),
    );
  });

  it("leaves a target alone when no tab came with the form, and never touches sign-in", () => {
    assert.equal(editorSectionTarget(PATH, undefined), PATH);
    assert.equal(editorSectionTarget(`${PATH}?notice=saved`, undefined), `${PATH}?notice=saved`);
    // A session that ended has one destination; a tab would be a query the sign-in page does not read.
    assert.equal(editorSectionTarget("/ingresar", "funciones"), "/ingresar");
  });
});

describe("attendanceTab", () => {
  it("offers the settings of a package that grants RSVP", () => {
    assert.equal(attendanceTab(["RSVP"]), "settings");
    assert.equal(attendanceTab(["GUEST_LIST", "RSVP"]), "settings");
  });

  it("offers the guest list of a package that grants only that", () => {
    assert.equal(attendanceTab(["GUEST_LIST"]), "guest-list");
  });

  it("offers neither for a package that grants neither", () => {
    assert.equal(attendanceTab([]), "none");
    assert.equal(attendanceTab(["GALLERY", "MUSIC"]), "none");
  });
});

describe("missingRequiredNames", () => {
  const fields = [field("celebrantName", true), field("date", true), field("message", false)];

  it("names the required fields the draft still has empty, and never an optional one", () => {
    assert.deepEqual(missingRequiredNames(fields, {}), ["celebrantName", "date"]);
    assert.deepEqual(missingRequiredNames(fields, { celebrantName: "Ana" }), ["date"]);
    // A blank text is empty: the creator cleared the field, so the API would not accept it as a value.
    assert.deepEqual(missingRequiredNames(fields, { celebrantName: "  " }), [
      "celebrantName",
      "date",
    ]);
    assert.deepEqual(
      missingRequiredNames(fields, { celebrantName: "Ana", date: "2027-05-15" }),
      [],
    );
  });

  it("counts a false checkbox and a zero number as filled values", () => {
    const typed: ContentField[] = [
      {
        name: "genderReveal",
        type: "boolean",
        label: "x",
        required: true,
        input: { kind: "checkbox" },
      },
      {
        name: "age",
        type: "integer",
        label: "x",
        required: true,
        input: { kind: "number", step: "1" },
      },
    ];

    assert.deepEqual(missingRequiredNames(typed, { genderReveal: false, age: "0" }), []);
  });
});

describe("sectionTabLabel", () => {
  it("shows the tab and its progress, the tab alone when it states none", () => {
    assert.equal(sectionTabLabel("contenido", "4 de 12"), "Contenido · 4 de 12");
    assert.equal(sectionTabLabel("contenido", ""), EDITOR_COPY.tabs.contenido);
    assert.equal(sectionTabLabel("fotos", "4 de 12"), "Fotos · 4 de 12");
  });
});

describe("editorSnapshotKey", () => {
  it("is the same key for the same stored draft, so a save never resets what the owner typed", () => {
    assert.equal(
      editorSnapshotKey({ content: { celebrantName: "Ana" }, status: "DRAFT" }),
      editorSnapshotKey({ content: { celebrantName: "Ana" }, status: "DRAFT" }),
    );
  });

  it("changes when a write elsewhere changed the stored draft, so the fields read it again", () => {
    assert.notEqual(
      editorSnapshotKey({ content: { mainPhoto: null } }),
      editorSnapshotKey({ content: { mainPhoto: "https://api.example.com/media/a.webp" } }),
    );
  });
});
