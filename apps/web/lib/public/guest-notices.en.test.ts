import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PublicGuestResponse } from "../server/public-invitations-api.ts";
import { guestAlbumNotice } from "./guest-album.ts";
import { guestbookNotice } from "./guestbook.ts";
import { guestGreeting, guestPassView, guestSeatsSentence } from "./invitation-guest-page.ts";
import { lockNotice, lockScreenView } from "./invitation-lock.ts";
import { lockWriteNotice } from "./invitation-lock-write.ts";
import { rsvpNotice } from "./invitation-rsvp.ts";

// The English notices and personal-page lines (F14; S2.14, L19.2): the server actions keep redirecting with the same
// codes, and the page renders each code in the locale it shows. These tests read the sentences and pin that the codes
// themselves never depend on the language.

const SLUG = "invitacion-k7m2qx";

/** One guest of the personal read, as the API answers it. */
const GUEST: PublicGuestResponse = {
  name: "Ana Gómez",
  seats: 3,
  tableLabel: "7",
  qrPass: true,
  response: { attending: true, partySize: 2, companions: [], dietaryNotes: null, message: null },
};

describe("the guest notices in English (F14; L19.2)", () => {
  it("renders each RSVP notice in English, with its code unchanged", () => {
    for (const code of [
      "received",
      "invalid",
      "closed",
      "limited",
      "unavailable",
      "locked",
    ] as const) {
      const notice = rsvpNotice({ rsvp: code }, "en");

      assert.equal(notice?.code, code);
      assert.ok(notice !== undefined);
      assert.match(notice.message, /^[A-Z¡]/);
      assert.doesNotMatch(notice.message, /Recibimos|Revisa|La confirmación|No pudimos/);
    }

    assert.equal(
      rsvpNotice({ rsvp: "received" }, "en")?.message,
      "Thank you! We received your answer.",
    );
    // The Spanish page is exactly what it was.
    assert.equal(rsvpNotice({ rsvp: "received" })?.message, "¡Gracias! Recibimos tu respuesta.");
  });

  it("renders each guestbook notice in English", () => {
    assert.equal(
      guestbookNotice({ firma: "signed" }, "en")?.message,
      "Thank you! Your message is now in the guestbook.",
    );
    assert.equal(guestbookNotice({ firma: "closed" }, "en")?.code, "closed");
    assert.doesNotMatch(
      guestbookNotice({ firma: "limited" }, "en")?.message ?? "",
      /Recibimos muchos intentos/,
    );
  });

  it("renders each album notice in English, including the two caps", () => {
    assert.equal(
      guestAlbumNotice({ foto: "uploaded" }, "en")?.message,
      "Thank you, your photo will appear once it's approved.",
    );
    assert.match(
      guestAlbumNotice({ foto: "pending-full" }, "en")?.message ?? "",
      /waiting for review/,
    );
    assert.match(guestAlbumNotice({ foto: "full" }, "en")?.message ?? "", /already full/);
    assert.equal(
      guestAlbumNotice({ foto: "uploaded" })?.message,
      "Gracias, tu foto aparecerá cuando la aprueben.",
    );
  });

  it("renders the lock screen's two refusals in English and keeps their codes", () => {
    assert.equal(lockNotice({ acceso: "rejected" }, "en")?.message, "That password isn't right.");
    assert.equal(
      lockNotice({ acceso: "limited" }, "en")?.message,
      "Too many attempts. Wait a few minutes.",
    );
    assert.equal(lockNotice({ acceso: "rejected" })?.message, "Esa contraseña no es correcta.");
    assert.equal(lockWriteNotice({ rsvp: "locked" }, "en")?.code, "locked");
    assert.match(lockWriteNotice({ rsvp: "locked" }, "en")?.message ?? "", /asks for a password/);
  });

  it("draws the lock screen view in English, with its one fact untouched", () => {
    const view = lockScreenView({ slug: SLUG, displayName: "Ana y Luis", locale: "en" });

    assert.equal(view?.subject, "Ana y Luis");
    assert.equal(
      view?.privateLine,
      "This invitation is private. Enter the password you were given.",
    );
    assert.equal(view?.fieldLabel, "Password");
    assert.equal(view?.submit, "View invitation");
    assert.equal(view?.hint, "Don't have it? Ask whoever invited you.");
    // An invitation whose content names nobody reads the English generic line.
    assert.equal(
      lockScreenView({ slug: SLUG, displayName: null, locale: "en" })?.subject,
      "Private invitation",
    );
    assert.equal(lockScreenView({ slug: SLUG, displayName: null })?.subject, "Invitación privada");
  });
});

describe("the personal page's own lines in English (F14; L19.2)", () => {
  it("greets the guest and states their seats in English", () => {
    assert.equal(guestGreeting("Ana Gómez", "en"), "Hi, Ana");
    assert.equal(guestSeatsSentence(3, "en"), "You have 3 seats reserved in your name.");
    assert.equal(guestSeatsSentence(1, "en"), "You have 1 seat reserved in your name.");
    assert.equal(guestGreeting("Ana Gómez"), "Hola, Ana");
    assert.equal(guestSeatsSentence(1), "Tienes 1 lugar reservado a tu nombre.");
  });

  it("keeps the pass values the guest reads, and the table the owner assigned", () => {
    const pass = guestPassView({ checkInUrl: `http://localhost:3000/x/${SLUG}`, guest: GUEST });

    assert.equal(pass?.name, "Ana Gómez");
    assert.equal(pass?.tableLabel, "7");
    assert.equal(pass?.people, 2);
  });
});
