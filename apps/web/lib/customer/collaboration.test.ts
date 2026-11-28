import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COLLABORATION_PATHS,
  COLLABORATOR_FAILURES,
  COLLABORATOR_PATHS,
  COLLABORATOR_TOKEN_LENGTH,
  type CollaboratorScreenView,
  editorAccessView,
  grantsInvitationPermission,
  INVITATION_PERMISSIONS,
  INVITATION_ROLES,
  isCollaborationAcceptPath,
  isCollaborationToken,
  isInvitationOwner,
  landingSection,
  OWNER_ACCESS,
  parseInvitationAccess,
  collaboratorScreenView,
  acceptCollaboration,
  inviteCollaborator,
  revokeCollaboratorAccess,
  saveCollaboratorPermissions,
} from "./collaboration.ts";
import {
  COLLABORATOR_COPY,
  INVITATION_ERROR_COPY,
  INVITATION_NOTICE_CODES,
  INVITATION_NOTICE_COPY,
} from "./copy.ts";
import { EDITOR_SECTIONS } from "./editor-sections.ts";
import type { CollaboratorList, InvitationResult } from "../server/invitations-api.ts";

// The co-hosts' web (F12; S2.12, L17). Two things are proven here: what the API's `role`/`permissions` mean for the
// screens — which tabs and which owner-only actions a caller may use — and what each submitted form answers, so every
// refusal reaches the owner as one neutral Spanish notice instead of a raw code or a browser error.

const ID = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
const COLLABORATOR_ID = "1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a";
const TOKEN = "a".repeat(COLLABORATOR_TOKEN_LENGTH);

const LIST: CollaboratorList = {
  maxCollaborators: 5,
  collaborators: [
    {
      id: COLLABORATOR_ID,
      email: "jorge@correo.com",
      permissions: ["EDIT_CONTENT", "VIEW_ATTENDANCE"],
      status: "PENDING",
      invitedAt: "2026-11-11T12:00:00.000Z",
      acceptedAt: null,
    },
    {
      id: "2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b",
      email: "paola@eventos.mx",
      permissions: ["EDIT_CONTENT", "VIEW_ATTENDANCE", "PUBLISH"],
      status: "ACTIVE",
      invitedAt: "2026-11-10T12:00:00.000Z",
      acceptedAt: "2026-11-12T12:00:00.000Z",
    },
  ],
};

function formOf(values: Record<string, string>): FormData {
  const form = new FormData();

  for (const [name, value] of Object.entries(values)) {
    form.set(name, value);
  }
  return form;
}

/** A form that carries one repeated field, which is how the permission chips travel. */
function chipsForm(values: Record<string, string>, permissions: readonly string[]): FormData {
  const form = formOf(values);

  for (const permission of permissions) {
    form.append("permissions", permission);
  }
  return form;
}

/** What the client answers for every call, so a test drives one outcome at a time. */
function client(answer: InvitationResult<unknown>) {
  return {
    collaborators: async () => answer as never,
    inviteCollaborator: async () => answer as never,
    updateCollaboratorPermissions: async () => answer as never,
    revokeCollaborator: async () => answer as never,
    acceptCollaboration: async () => answer as never,
  };
}

/** A client that records one call's arguments, so a test sees exactly what a form sent. */
function recordingClient(answer: InvitationResult<unknown>) {
  const calls: unknown[][] = [];
  const record =
    (name: string) =>
    async (...args: unknown[]) => {
      calls.push([name, ...args]);
      return answer as never;
    };

  return {
    calls,
    client: {
      collaborators: record("collaborators"),
      inviteCollaborator: record("inviteCollaborator"),
      updateCollaboratorPermissions: record("updateCollaboratorPermissions"),
      revokeCollaborator: record("revokeCollaborator"),
      acceptCollaboration: record("acceptCollaboration"),
    },
  };
}

describe("the caller's access to one invitation (F12; L17.2, L17.4)", () => {
  it("reads a body written before F12 as the owner, which is what an older API answered everyone (L20)", () => {
    assert.deepEqual(parseInvitationAccess({}), OWNER_ACCESS);
    assert.deepEqual(parseInvitationAccess({ id: ID, slug: "invitacion-k7m2qx" }), OWNER_ACCESS);
    assert.equal(isInvitationOwner(OWNER_ACCESS), true);
  });

  it("reads an owner's own answer, whose permission set is empty because ownership is not a permission", () => {
    assert.deepEqual(parseInvitationAccess({ role: "OWNER", permissions: [] }), OWNER_ACCESS);
  });

  it("reads a collaborator's permissions in the domain's canonical order", () => {
    assert.deepEqual(parseInvitationAccess({ role: "COLLABORATOR", permissions: ["PUBLISH"] }), {
      role: "COLLABORATOR",
      permissions: ["PUBLISH"],
    });
    assert.deepEqual(
      parseInvitationAccess({
        role: "COLLABORATOR",
        permissions: ["PUBLISH", "EDIT_CONTENT"],
      }),
      { role: "COLLABORATOR", permissions: ["EDIT_CONTENT", "PUBLISH"] },
    );
  });

  it("refuses a role, a permission, or a set the contract does not have", () => {
    for (const body of [
      { role: "ADMIN", permissions: [] },
      { role: "COLLABORATOR", permissions: ["REFUND"] },
      { role: "COLLABORATOR", permissions: ["EDIT_CONTENT", "EDIT_CONTENT"] },
      { role: "COLLABORATOR", permissions: [] },
      { role: "COLLABORATOR", permissions: "EDIT_CONTENT" },
      { role: "OWNER", permissions: ["EDIT_CONTENT"] },
      { permissions: ["EDIT_CONTENT"] },
      { role: "COLLABORATOR" },
      { role: null, permissions: [] },
    ]) {
      assert.equal(parseInvitationAccess(body), undefined, JSON.stringify(body));
    }
  });

  it("keeps owner-only capabilities out of the permission vocabulary, so no stored value can grant them", () => {
    assert.deepEqual([...INVITATION_PERMISSIONS], ["EDIT_CONTENT", "VIEW_ATTENDANCE", "PUBLISH"]);
    assert.deepEqual([...INVITATION_ROLES], ["OWNER", "COLLABORATOR"]);
    assert.equal(
      (INVITATION_PERMISSIONS as readonly string[]).includes("PAY"),
      false,
      "paying is never a grantable permission (L17.2)",
    );
  });

  it("grants everything to the owner and only the stored permissions to a collaborator", () => {
    const collaborator = { role: "COLLABORATOR", permissions: ["VIEW_ATTENDANCE"] } as const;

    for (const permission of INVITATION_PERMISSIONS) {
      assert.equal(grantsInvitationPermission(OWNER_ACCESS, permission), true, permission);
    }
    assert.equal(grantsInvitationPermission(collaborator, "VIEW_ATTENDANCE"), true);
    assert.equal(grantsInvitationPermission(collaborator, "EDIT_CONTENT"), false);
    assert.equal(grantsInvitationPermission(collaborator, "PUBLISH"), false);
  });
});

describe("the tabs and the owner-only actions of the editor (F12; L17.5)", () => {
  it("offers the owner all five tabs and every owner-only action", () => {
    const view = editorAccessView(OWNER_ACCESS);

    assert.deepEqual(view.sections, [...EDITOR_SECTIONS]);
    assert.equal(view.owner, true);
    assert.equal(view.canEditContent, true);
    assert.equal(view.canViewAttendance, true);
    assert.equal(view.canPublish, true);
    assert.equal(view.showPayment, true);
    assert.equal(view.showArchive, true);
    assert.equal(view.showAddress, true);
    assert.equal(view.showCollaborators, true);
    assert.equal(view.showGuestbook, true);
  });

  it("gives a collaborator the content tabs alone when it may only edit the content", () => {
    const view = editorAccessView({ role: "COLLABORATOR", permissions: ["EDIT_CONTENT"] });

    assert.deepEqual(view.sections, ["contenido", "fotos", "funciones"]);
    assert.equal(view.canEditContent, true);
    assert.equal(view.canViewAttendance, false);
    assert.equal(view.canPublish, false);
    for (const hidden of [
      view.showPayment,
      view.showArchive,
      view.showAddress,
      view.showCollaborators,
      view.showGuestbook,
    ]) {
      assert.equal(hidden, false);
    }
  });

  it("gives a collaborator the attendance tab alone when it may only see who answered", () => {
    const view = editorAccessView({ role: "COLLABORATOR", permissions: ["VIEW_ATTENDANCE"] });

    assert.deepEqual(view.sections, ["asistencia"]);
    assert.equal(view.canViewAttendance, true);
    assert.equal(view.canEditContent, false);
    assert.equal(view.canPublish, false);
  });

  it("gives a collaborator the publish tab alone when it may only publish and unpublish", () => {
    const view = editorAccessView({ role: "COLLABORATOR", permissions: ["PUBLISH"] });

    assert.deepEqual(view.sections, ["publicar"]);
    assert.equal(view.canPublish, true);
    assert.equal(view.canEditContent, false);
    // Publishing is a permission; paying and archiving never are (L17.2).
    assert.equal(view.showPayment, false);
    assert.equal(view.showArchive, false);
    assert.equal(view.showAddress, false);
  });

  it("keeps the editor's own order when a collaborator holds all three permissions", () => {
    const view = editorAccessView({
      role: "COLLABORATOR",
      permissions: ["PUBLISH", "VIEW_ATTENDANCE", "EDIT_CONTENT"],
    });

    assert.deepEqual(view.sections, [...EDITOR_SECTIONS]);
    // The three permissions are not ownership: the owner-only actions stay hidden.
    assert.equal(view.showArchive, false);
    assert.equal(view.showPayment, false);
    assert.equal(view.showAddress, false);
    assert.equal(view.showCollaborators, false);
  });

  it("opens the first tab the caller may use when the URL names one it may not", () => {
    const publisher = editorAccessView({ role: "COLLABORATOR", permissions: ["PUBLISH"] });

    assert.equal(landingSection(publisher.sections, "contenido"), "publicar");
    assert.equal(landingSection(publisher.sections, "publicar"), "publicar");
    assert.equal(landingSection([...EDITOR_SECTIONS], "asistencia"), "asistencia");
  });
});

describe("the co-hosts screen (F12; L17.3, L17.5)", () => {
  it("lists each collaborator with its state in words and the date of that state", () => {
    const view: CollaboratorScreenView = collaboratorScreenView(LIST);

    assert.deepEqual(
      view.rows.map((row) => row.email),
      ["jorge@correo.com", "paola@eventos.mx"],
    );
    assert.equal(view.rows[0]?.state, COLLABORATOR_COPY.invited("11 nov 2026"));
    assert.match(view.rows[0]?.state ?? "", /^Invitación enviada/);
    assert.equal(view.rows[1]?.state, COLLABORATOR_COPY.accepted("12 nov 2026"));
    assert.match(view.rows[1]?.state ?? "", /^Aceptó/);
    // Every chip is text as well as tone, so nothing here depends on a colour alone.
    assert.deepEqual(
      view.rows[0]?.chips.map((chip) => [chip.label, chip.on]),
      [
        ["Editar contenido", true],
        ["Ver asistencia", true],
        ["Publicar", false],
      ],
    );
  });

  it("states the limit the API answered, in words, and how many places are left", () => {
    const view = collaboratorScreenView(LIST);

    assert.equal(view.limit, COLLABORATOR_COPY.limit(5));
    assert.match(view.limit, /5 personas/);
    assert.equal(view.remaining, 3);
    assert.equal(view.atLimit, false);
    assert.equal(view.canInvite, true);
  });

  it("stops offering the invitation at the cap and says so in words", () => {
    const accepted = LIST.collaborators[1];

    assert.ok(accepted);
    const full: CollaboratorList = {
      maxCollaborators: 5,
      collaborators: Array.from({ length: 5 }, (_, index) => ({
        ...accepted,
        id: `${index}${COLLABORATOR_ID.slice(1)}`,
        email: `persona${index}@correo.com`,
      })),
    };
    const view = collaboratorScreenView(full);

    assert.equal(view.remaining, 0);
    assert.equal(view.atLimit, true);
    assert.equal(view.canInvite, false);
    assert.equal(view.limitReached, COLLABORATOR_COPY.limitReached(5));
  });

  it("says the screen has nobody yet instead of showing an empty box", () => {
    assert.equal(collaboratorScreenView({ maxCollaborators: 5, collaborators: [] }).empty, true);
    assert.equal(collaboratorScreenView(LIST).empty, false);
  });

  it("shows the «Pagar» chip locked and labelled as the owner's alone (L17.2)", () => {
    const view = collaboratorScreenView(LIST);

    assert.equal(view.lockedChip.label, "Pagar");
    assert.equal(view.lockedChip.note, "Solo el dueño");
    assert.equal(view.lockedChip.selectable, false);
    assert.equal(view.ownerNote, COLLABORATOR_COPY.ownerNote);
  });

  it("keeps its own path inside the invitation it belongs to", () => {
    assert.equal(COLLABORATOR_PATHS.page(ID), `/cuenta/invitaciones/${ID}/coanfitriones`);
  });
});

describe("the acceptance link the email carries (F12; L17.3)", () => {
  it("matches the path and the token shape the API's message builds", () => {
    assert.equal(COLLABORATION_PATHS.accept, "/colaboraciones/aceptar");
    assert.equal(isCollaborationAcceptPath(`/colaboraciones/aceptar?token=${TOKEN}`), true);
    assert.equal(isCollaborationAcceptPath(`${COLLABORATION_PATHS.accept}?token=abc`), false);
    assert.equal(isCollaborationAcceptPath("https://evil.example/colaboraciones/aceptar"), false);
    assert.equal(isCollaborationAcceptPath(`/cuenta/invitaciones/${ID}`), false);
    assert.equal(isCollaborationToken(`${"a".repeat(21)}=`), false);
    assert.equal(isCollaborationToken(TOKEN), true);
  });
});

describe("the writes of the co-hosts screen (F12; L17.3)", () => {
  it("invites one address with the chips the owner marked and comes back with its notice", async () => {
    const recorded = recordingClient({ ok: true, value: LIST.collaborators[0] });

    const target = await inviteCollaborator(
      recorded.client,
      chipsForm({ id: ID, email: "  jorge@correo.com " }, ["VIEW_ATTENDANCE", "EDIT_CONTENT"]),
    );

    assert.equal(target, `${COLLABORATOR_PATHS.page(ID)}?notice=collaborator-invited`);
    assert.deepEqual(recorded.calls, [
      ["inviteCollaborator", ID, "jorge@correo.com", ["EDIT_CONTENT", "VIEW_ATTENDANCE"]],
    ]);
  });

  it("refuses an empty address or an empty set before spending a request", async () => {
    const recorded = recordingClient({ ok: true, value: LIST.collaborators[0] });

    assert.equal(
      await inviteCollaborator(recorded.client, chipsForm({ id: ID, email: " " }, ["PUBLISH"])),
      `${COLLABORATOR_PATHS.page(ID)}?error=collaborator-invalid`,
    );
    assert.equal(
      await inviteCollaborator(recorded.client, chipsForm({ id: ID, email: "a@b.mx" }, [])),
      `${COLLABORATOR_PATHS.page(ID)}?error=collaborator-invalid`,
    );
    assert.deepEqual(recorded.calls, []);
  });

  it("replaces the permissions of one collaborator and comes back with its notice", async () => {
    const recorded = recordingClient({ ok: true, value: LIST.collaborators[0] });

    const target = await saveCollaboratorPermissions(
      recorded.client,
      chipsForm({ id: ID, collaboratorId: COLLABORATOR_ID }, ["PUBLISH"]),
    );

    assert.equal(target, `${COLLABORATOR_PATHS.page(ID)}?notice=collaborator-saved`);
    assert.deepEqual(recorded.calls, [
      ["updateCollaboratorPermissions", ID, COLLABORATOR_ID, ["PUBLISH"]],
    ]);
  });

  it("revokes one collaborator and comes back with its notice", async () => {
    const recorded = recordingClient({ ok: true, value: LIST.collaborators[0] });

    const target = await revokeCollaboratorAccess(
      recorded.client,
      formOf({ id: ID, collaboratorId: COLLABORATOR_ID }),
    );

    assert.equal(target, `${COLLABORATOR_PATHS.page(ID)}?notice=collaborator-revoked`);
    assert.deepEqual(recorded.calls, [["revokeCollaborator", ID, COLLABORATOR_ID]]);
  });

  it("treats a collaborator the API no longer knows as already gone (L17.3)", async () => {
    const recorded = recordingClient({
      ok: false,
      failure: "collaborator-not-found",
    });

    assert.equal(
      await revokeCollaboratorAccess(
        recorded.client,
        formOf({ id: ID, collaboratorId: COLLABORATOR_ID }),
      ),
      `${COLLABORATOR_PATHS.page(ID)}?notice=collaborator-revoked`,
    );
  });

  it("answers every other refusal with one neutral notice and never a raw code", async () => {
    for (const failure of COLLABORATOR_FAILURES) {
      const target = await inviteCollaborator(
        client({ ok: false, failure }),
        chipsForm({ id: ID, email: "jorge@correo.com" }, ["PUBLISH"]),
      );
      const code = new URL(target, "https://invitame.mx").searchParams.get("error");

      assert.equal(
        target,
        `${COLLABORATOR_PATHS.page(ID)}?error=${failure}`,
        `${failure} keeps its own code`,
      );
      assert.ok(code === null || Object.hasOwn(INVITATION_ERROR_COPY, code), failure);
      assert.ok(
        code === null
          ? false
          : !/\b(usted|ingrese|escriba|revise|intente)\b/i.test(
              INVITATION_ERROR_COPY[code as never],
            ),
        `${failure} is written with tú`,
      );
    }
  });

  it("sends an ended session to sign-in from every write", async () => {
    for (const target of [
      await inviteCollaborator(
        client({ ok: false, failure: "signed-out" }),
        chipsForm({ id: ID, email: "jorge@correo.com" }, ["PUBLISH"]),
      ),
      await saveCollaboratorPermissions(
        client({ ok: false, failure: "signed-out" }),
        chipsForm({ id: ID, collaboratorId: COLLABORATOR_ID }, ["PUBLISH"]),
      ),
      await revokeCollaboratorAccess(
        client({ ok: false, failure: "signed-out" }),
        formOf({ id: ID, collaboratorId: COLLABORATOR_ID }),
      ),
    ]) {
      assert.equal(target, "/ingresar");
    }
  });

  it("refuses a form whose ids cannot name a stored row, without spending a request", async () => {
    const recorded = recordingClient({ ok: true, value: LIST.collaborators[0] });

    assert.equal(
      await inviteCollaborator(
        recorded.client,
        chipsForm({ id: "no-es-uuid", email: "jorge@correo.com" }, ["PUBLISH"]),
      ),
      "/cuenta/invitaciones?error=not-found",
    );
    assert.equal(
      await saveCollaboratorPermissions(
        recorded.client,
        chipsForm({ id: ID, collaboratorId: "no-es-uuid" }, ["PUBLISH"]),
      ),
      `${COLLABORATOR_PATHS.page(ID)}?error=collaborator-not-found`,
    );
    assert.deepEqual(recorded.calls, []);
  });
});

describe("accepting a collaboration (F12; L17.3)", () => {
  it("accepts the emailed token and goes to the shared invitation with its notice", async () => {
    const recorded = recordingClient({ ok: true, value: { invitationId: ID } });

    const target = await acceptCollaboration(recorded.client, formOf({ token: TOKEN }));

    assert.equal(target, `/cuenta/invitaciones/${ID}?notice=collaboration-accepted`);
    assert.deepEqual(recorded.calls, [["acceptCollaboration", TOKEN]]);
  });

  it("answers every refusal with the same neutral notice, never saying why", async () => {
    for (const failure of ["collaboration-not-found", "not-found"] as const) {
      const target = await acceptCollaboration(
        client({ ok: false, failure }),
        formOf({ token: TOKEN }),
      );

      assert.equal(
        target,
        `${COLLABORATION_PATHS.accept}?token=${TOKEN}&error=collaboration-not-found`,
      );
    }
    assert.equal(INVITATION_ERROR_COPY["collaboration-not-found"], COLLABORATOR_COPY.acceptRefused);
  });

  it("treats a token that cannot be one as the same refusal, without spending a request", async () => {
    const recorded = recordingClient({ ok: true, value: { invitationId: ID } });

    assert.equal(
      await acceptCollaboration(recorded.client, formOf({ token: "abc" })),
      `${COLLABORATION_PATHS.accept}?error=collaboration-not-found`,
    );
    assert.deepEqual(recorded.calls, []);
  });

  it("sends an ended session through sign-in with the way back", async () => {
    assert.equal(
      await acceptCollaboration(
        client({ ok: false, failure: "signed-out" }),
        formOf({ token: TOKEN }),
      ),
      "/ingresar",
    );
  });
});

describe("the notices of the co-hosts' writes", () => {
  it("confirms the invitation, the permission change, the revocation, and the acceptance in words", () => {
    assert.deepEqual(
      INVITATION_NOTICE_CODES.filter(
        (code) => code.startsWith("collaborat") && code !== "collaboration-accepted",
      ),
      ["collaborator-invited", "collaborator-saved", "collaborator-revoked"],
    );
    assert.match(INVITATION_NOTICE_COPY["collaborator-invited"], /^Listo, .*invitación/);
    assert.equal(INVITATION_NOTICE_COPY["collaborator-saved"], "Listo, guardamos los permisos.");
    assert.equal(
      INVITATION_NOTICE_COPY["collaborator-revoked"],
      "Listo, esa persona ya no tiene acceso.",
    );
    assert.equal(
      INVITATION_NOTICE_COPY["collaboration-accepted"],
      "Listo, ya colaboras en esta invitación.",
    );
  });
});
