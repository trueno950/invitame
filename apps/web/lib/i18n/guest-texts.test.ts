import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GUEST_ALBUM_NOTICE_COPY,
  GUEST_PAGE_COPY,
  GUESTBOOK_FORM_COPY,
  GUESTBOOK_NOTICE_COPY,
  LOCK_SCREEN_COPY,
  PUBLIC_INVITATION_COPY,
  RSVP_FORM_COPY,
  RSVP_NOTICE_COPY,
} from "../customer/copy.ts";
import {
  GUEST_ALBUM_PHOTO_ALT_FALLBACK,
  guestAlbumCount,
  guestAlbumPhotoAlt,
} from "../invitation-features/guest-album.ts";
import {
  GALLERY_FALLBACK_ALT,
  GALLERY_SECTION_HINT,
  GALLERY_SECTION_TITLE,
  galleryPhotoAlt,
} from "../invitation-features/gallery.ts";
import {
  GIFT_REGISTRY_ENVELOPES_LINE,
  GIFT_REGISTRY_SECTION_HINT,
  GIFT_REGISTRY_SECTION_TITLE,
  GIFT_REGISTRY_TRANSFER_TITLE,
  GIFT_REGISTRY_VIEW_STORE,
} from "../invitation-features/gift-registry.ts";
import {
  ITINERARY_SECTION_HINT,
  ITINERARY_SECTION_TITLE,
} from "../invitation-features/itinerary.ts";
import {
  LIVESTREAM_FALLBACK_LABEL,
  LIVESTREAM_IFRAME_TITLE,
  LIVESTREAM_OPEN_LABEL,
  LIVESTREAM_PLAY_LABEL,
  LIVESTREAM_SECTION_TITLE,
} from "../invitation-features/livestream.ts";
import {
  LODGING_BOOK_LABEL,
  LODGING_GROUP_CODE_LABEL,
  LODGING_SECTION_HINT,
  LODGING_SECTION_KICKER,
  LODGING_SECTION_TITLE,
  LODGING_TRANSPORT_TITLE,
} from "../invitation-features/lodging.ts";
import {
  MUSIC_COVER_ALT,
  MUSIC_SECTION_TITLE,
  musicButtonLabel,
} from "../invitation-features/music.ts";
import { OPENING_ANIMATION_COPY } from "../invitation-features/opening-animation.ts";
import {
  ENGLISH_GUEST_FORMATS,
  ENGLISH_GUEST_TEXTS,
  GUEST_DICTIONARIES,
  GUEST_FORMAT_DICTIONARIES,
  guestFormats,
  guestText,
  guestTextKeys,
  guestTexts,
  SPANISH_GUEST_FORMATS,
  SPANISH_GUEST_TEXTS,
} from "./guest-texts.ts";

// The typed dictionary of every fixed guest-facing text (F14; S2.14, L19.2). Spanish is the source of truth and the
// English dictionary is typed by the same keys, so a key added without its English value fails `tsc`; these tests prove
// the same rules at runtime, and they pin every Spanish value to the constant it renders today, so translating the
// guest page can never silently change what a Spanish guest reads.

describe("the guest text dictionary (F14; L19.2)", () => {
  it("declares every Spanish key once and answers a non-empty English value for each of them", () => {
    const keys = Object.keys(SPANISH_GUEST_TEXTS);

    assert.ok(keys.length > 100);
    assert.deepEqual([...Object.keys(ENGLISH_GUEST_TEXTS)].sort(), [...keys].sort());

    for (const key of keys) {
      const english = ENGLISH_GUEST_TEXTS[key as keyof typeof ENGLISH_GUEST_TEXTS];

      assert.equal(typeof english, "string", key);
      assert.notEqual(english.trim(), "", key);
    }
  });

  it("holds the same keys in both locales and nothing outside the Spanish declaration", () => {
    const keys = [...guestTextKeys()].sort();

    assert.deepEqual([...Object.keys(SPANISH_GUEST_TEXTS)].sort(), keys);
    assert.deepEqual([...Object.keys(GUEST_DICTIONARIES.es)].sort(), keys);
    assert.deepEqual([...Object.keys(GUEST_DICTIONARIES.en)].sort(), keys);
  });

  it("answers the text of the locale it is asked for, and never the other locale's", () => {
    assert.equal(guestText("es", "rsvp.title"), "Confirma tu asistencia");
    assert.equal(guestText("en", "rsvp.title"), "RSVP");
    assert.equal(guestText("es", "giftRegistry.title"), "Mesa de regalos");
    assert.equal(guestText("en", "giftRegistry.title"), "Gift registry");
    assert.equal(guestText("es", "lodging.title"), "Hospedaje");
    assert.equal(guestText("en", "lodging.title"), "Where to stay");
    assert.equal(guestTexts("es"), SPANISH_GUEST_TEXTS);
    assert.equal(guestTexts("en"), ENGLISH_GUEST_TEXTS);
  });

  it("declares the same interpolated texts in both locales, typed by the Spanish functions", () => {
    assert.deepEqual(
      [...Object.keys(GUEST_FORMAT_DICTIONARIES.es)].sort(),
      [...Object.keys(GUEST_FORMAT_DICTIONARIES.en)].sort(),
    );
    for (const key of Object.keys(
      SPANISH_GUEST_FORMATS,
    ) as (keyof typeof SPANISH_GUEST_FORMATS)[]) {
      assert.equal(typeof SPANISH_GUEST_FORMATS[key], "function", key);
      assert.equal(typeof ENGLISH_GUEST_FORMATS[key], "function", key);
    }
    assert.equal(guestFormats("es"), SPANISH_GUEST_FORMATS);
    assert.equal(guestFormats("en"), ENGLISH_GUEST_FORMATS);
    assert.equal(guestFormats("es").greeting("Ana"), "Hola, Ana");
    assert.equal(guestFormats("en").greeting("Ana"), "Hi, Ana");
  });

  it("writes the words the product already writes, so Spanish output is unchanged", () => {
    // Every fixed line this change translates is compared with the constant the guest page renders today. The design
    // keeps the dictionary self-contained, so this test is what makes the two agree.
    const ORIGINALS: Readonly<Record<string, string>> = {
      "block.heading": "Todo lo que necesitas",
      "countdown.title": "Cuenta regresiva",
      "countdown.today": "¡Hoy es el día!",
      "countdown.live": "¡Es hoy!",
      "countdown.passed": "La celebración ya pasó",
      "countdown.soon": "Falta menos de un minuto",
      "countdown.firstMoment": "Primer momento",
      "map.title": "Cómo llegar",
      "calendar.title": "Agregar al calendario",
      "calendar.hint": "Guarda la fecha para no olvidarla.",
      "calendar.google": "Google Calendar",
      "calendar.download": "Descargar .ics",
      "calendar.prodid": "-//InvitaMe//Invitaciones//ES",
      "whatsapp.title": "Escribir por WhatsApp",
      "whatsapp.hint": "Escribe para confirmar tu asistencia.",
      "whatsapp.action": "Escribir por WhatsApp",
      "music.title": MUSIC_SECTION_TITLE,
      "music.coverAlt": MUSIC_COVER_ALT,
      "music.hint": "La música que elegimos para esta celebración.",
      "itinerary.title": ITINERARY_SECTION_TITLE,
      "itinerary.hint": ITINERARY_SECTION_HINT,
      "itinerary.directions": "Cómo llegar",
      "giftRegistry.title": GIFT_REGISTRY_SECTION_TITLE,
      "giftRegistry.hint": GIFT_REGISTRY_SECTION_HINT,
      "giftRegistry.transferTitle": GIFT_REGISTRY_TRANSFER_TITLE,
      "giftRegistry.bank": "Banco",
      "giftRegistry.holder": "Titular",
      "giftRegistry.clabe": "CLABE",
      "giftRegistry.viewStore": GIFT_REGISTRY_VIEW_STORE,
      "giftRegistry.copyClabe": "Copiar CLABE",
      "giftRegistry.copied": "¡Copiada!",
      "giftRegistry.envelopes": GIFT_REGISTRY_ENVELOPES_LINE,
      "lodging.kicker": LODGING_SECTION_KICKER,
      "lodging.title": LODGING_SECTION_TITLE,
      "lodging.hint": LODGING_SECTION_HINT,
      "lodging.transportTitle": LODGING_TRANSPORT_TITLE,
      "lodging.groupCode": LODGING_GROUP_CODE_LABEL,
      "lodging.book": LODGING_BOOK_LABEL,
      "livestream.title": LIVESTREAM_SECTION_TITLE,
      "livestream.open": LIVESTREAM_OPEN_LABEL,
      "livestream.play": LIVESTREAM_PLAY_LABEL,
      "livestream.fallback": LIVESTREAM_FALLBACK_LABEL,
      "livestream.iframeTitle": LIVESTREAM_IFRAME_TITLE,
      "gallery.title": GALLERY_SECTION_TITLE,
      "gallery.hint": GALLERY_SECTION_HINT,
      "rsvp.title": RSVP_FORM_COPY.title,
      "rsvp.hint": RSVP_FORM_COPY.hint,
      "rsvp.nameLabel": RSVP_FORM_COPY.nameLabel,
      "rsvp.namePlaceholder": RSVP_FORM_COPY.namePlaceholder,
      "rsvp.attendingLegend": RSVP_FORM_COPY.attendingLegend,
      "rsvp.attendingYes": RSVP_FORM_COPY.attendingYes,
      "rsvp.attendingNo": RSVP_FORM_COPY.attendingNo,
      "rsvp.partyLabel": RSVP_FORM_COPY.partyLabel,
      "rsvp.partyHint": RSVP_FORM_COPY.partyHint,
      "rsvp.companionsLegend": RSVP_FORM_COPY.companionsLegend,
      "rsvp.companionsHint": RSVP_FORM_COPY.companionsHint,
      "rsvp.companionPlaceholder": RSVP_FORM_COPY.companionNamePlaceholder,
      "rsvp.companionChild": RSVP_FORM_COPY.companionChildLabel,
      "rsvp.dietaryLabel": RSVP_FORM_COPY.dietaryLabel,
      "rsvp.dietaryHint": RSVP_FORM_COPY.dietaryHint,
      "rsvp.phoneLabel": RSVP_FORM_COPY.phoneLabel,
      "rsvp.phoneHint": RSVP_FORM_COPY.phoneHint,
      "rsvp.messageLabel": RSVP_FORM_COPY.messageLabel,
      "rsvp.messageHint": RSVP_FORM_COPY.messageHint,
      "rsvp.submit": RSVP_FORM_COPY.submit,
      "rsvp.honeypot": RSVP_FORM_COPY.honeypotLabel,
      "rsvp.closedGeneric": RSVP_FORM_COPY.closedGeneric,
      "guestPage.answerTitle": GUEST_PAGE_COPY.answerTitle,
      "guestPage.partyLabel": GUEST_PAGE_COPY.partyLabel,
      "guestPage.messageLabel": GUEST_PAGE_COPY.messageLabel,
      "guestPage.messageHint": GUEST_PAGE_COPY.messageHint,
      "guestPage.submit": GUEST_PAGE_COPY.submit,
      "guestPage.answerCurrentNo": GUEST_PAGE_COPY.answerCurrentNo,
      "guestPage.answerPending": GUEST_PAGE_COPY.answerPending,
      "guestPage.answerHint": GUEST_PAGE_COPY.answerHint,
      "guestPage.passKicker": GUEST_PAGE_COPY.passKicker,
      "guestPage.passTable": GUEST_PAGE_COPY.passTableLabel,
      "guestPage.passPeople": GUEST_PAGE_COPY.passPeopleLabel,
      "guestPage.passHint": GUEST_PAGE_COPY.passHint,
      "guestPage.passAlt": GUEST_PAGE_COPY.passAlt,
      "guestbook.title": GUESTBOOK_FORM_COPY.title,
      "guestbook.hint": GUESTBOOK_FORM_COPY.hint,
      "guestbook.nameLabel": GUESTBOOK_FORM_COPY.nameLabel,
      "guestbook.namePlaceholder": GUESTBOOK_FORM_COPY.namePlaceholder,
      "guestbook.messageLabel": GUESTBOOK_FORM_COPY.messageLabel,
      "guestbook.messagePlaceholder": GUESTBOOK_FORM_COPY.messagePlaceholder,
      "guestbook.messageHint": GUESTBOOK_FORM_COPY.messageHint,
      "guestbook.submit": GUESTBOOK_FORM_COPY.submit,
      "guestbook.empty": GUESTBOOK_FORM_COPY.emptyNote,
      "guestbook.closed": GUESTBOOK_FORM_COPY.closedNote,
      "guestbook.honeypot": GUESTBOOK_FORM_COPY.honeypotLabel,
      "notice.rsvp.received": RSVP_NOTICE_COPY.received,
      "notice.rsvp.invalid": RSVP_NOTICE_COPY.invalid,
      "notice.rsvp.closed": RSVP_NOTICE_COPY.closed,
      "notice.rsvp.limited": RSVP_NOTICE_COPY.limited,
      "notice.rsvp.unavailable": RSVP_NOTICE_COPY.unavailable,
      "notice.guestbook.signed": GUESTBOOK_NOTICE_COPY.signed,
      "notice.guestbook.invalid": GUESTBOOK_NOTICE_COPY.invalid,
      "notice.guestbook.closed": GUESTBOOK_NOTICE_COPY.closed,
      "notice.guestbook.limited": GUESTBOOK_NOTICE_COPY.limited,
      "notice.guestbook.unavailable": GUESTBOOK_NOTICE_COPY.unavailable,
      "notice.album.uploaded": GUEST_ALBUM_NOTICE_COPY.uploaded,
      "notice.album.invalid": GUEST_ALBUM_NOTICE_COPY.invalid,
      "notice.album.closed": GUEST_ALBUM_NOTICE_COPY.closed,
      "notice.album.full": GUEST_ALBUM_NOTICE_COPY.full,
      "notice.album.pendingFull": GUEST_ALBUM_NOTICE_COPY["pending-full"],
      "notice.album.limited": GUEST_ALBUM_NOTICE_COPY.limited,
      "notice.album.unavailable": GUEST_ALBUM_NOTICE_COPY.unavailable,
      "lock.privateTitle": LOCK_SCREEN_COPY.privateTitle,
      "lock.privateLine": LOCK_SCREEN_COPY.privateLine,
      "lock.fieldLabel": LOCK_SCREEN_COPY.fieldLabel,
      "lock.submit": LOCK_SCREEN_COPY.submit,
      "lock.hint": LOCK_SCREEN_COPY.hint,
      "lock.rejected": LOCK_SCREEN_COPY.rejected,
      "lock.limited": LOCK_SCREEN_COPY.limited,
      "lock.writeRefused": LOCK_SCREEN_COPY.writeRefused,
      "opening.tap": OPENING_ANIMATION_COPY.tap,
      "footer.madeWith": PUBLIC_INVITATION_COPY.madeWith,
    };

    for (const [key, original] of Object.entries(ORIGINALS)) {
      assert.equal(guestText("es", key as keyof typeof SPANISH_GUEST_TEXTS), original, key);
    }
    // The two fallbacks the block already built from their own constants.
    assert.equal(guestText("es", "album.altFallback"), GUEST_ALBUM_PHOTO_ALT_FALLBACK);
    assert.equal(guestText("es", "gallery.alt"), GALLERY_FALLBACK_ALT);
    // The map's credit is not a product line: only the language of the data sources follows the locale.
    assert.equal(
      guestText("es", "map.attribution"),
      "© OpenStreetMap contributors · Mapas: OpenFreeMap",
    );
    assert.equal(
      guestText("en", "map.attribution"),
      "© OpenStreetMap contributors · Maps: OpenFreeMap",
    );
  });

  it("writes the words the countdown, the album, and the playlist already built, for every value", () => {
    assert.deepEqual(
      [1, 2, 10].map((value) => SPANISH_GUEST_FORMATS.countdownDays(value)),
      [1, 2, 10].map((value) => (value === 1 ? "día" : "días")),
    );
    assert.equal(SPANISH_GUEST_FORMATS.musicButton("Spotify"), musicButtonLabel("spotify"));
    assert.equal(SPANISH_GUEST_FORMATS.albumCount(1), guestAlbumCount(1));
    assert.equal(SPANISH_GUEST_FORMATS.albumCount(12), guestAlbumCount(12));
    assert.equal(SPANISH_GUEST_FORMATS.albumPhotoAlt("Jorge"), guestAlbumPhotoAlt("Jorge"));
    assert.equal(SPANISH_GUEST_FORMATS.albumPhotoAlt(null), guestAlbumPhotoAlt(null));
    assert.equal(SPANISH_GUEST_FORMATS.galleryPhotoAlt(null), galleryPhotoAlt(null));
    assert.equal(SPANISH_GUEST_FORMATS.galleryPhotoAlt("La novia"), galleryPhotoAlt("La novia"));
    assert.equal(SPANISH_GUEST_FORMATS.partyLimitNote(1), RSVP_FORM_COPY.partyLimitNote(1));
    assert.equal(SPANISH_GUEST_FORMATS.partyLimitNote(3), RSVP_FORM_COPY.partyLimitNote(3));
    assert.equal(SPANISH_GUEST_FORMATS.companionRow(2), RSVP_FORM_COPY.companionRow(2));
    assert.equal(
      SPANISH_GUEST_FORMATS.deadlineNote("5 de diciembre"),
      RSVP_FORM_COPY.deadlineNote("5 de diciembre"),
    );
    assert.equal(
      SPANISH_GUEST_FORMATS.closedNote("5 de diciembre"),
      RSVP_FORM_COPY.closedNote("5 de diciembre"),
    );
    assert.equal(SPANISH_GUEST_FORMATS.answerCurrentYes(1), GUEST_PAGE_COPY.answerCurrentYes(1));
    assert.equal(SPANISH_GUEST_FORMATS.answerCurrentYes(4), GUEST_PAGE_COPY.answerCurrentYes(4));
    assert.equal(SPANISH_GUEST_FORMATS.greeting("Ana"), GUEST_PAGE_COPY.greeting("Ana"));
    assert.equal(SPANISH_GUEST_FORMATS.seatsSentence(1), GUEST_PAGE_COPY.seatsOne);
    assert.equal(SPANISH_GUEST_FORMATS.seatsSentence(4), GUEST_PAGE_COPY.seatsMany(4));
    assert.equal(
      SPANISH_GUEST_FORMATS.passVenueHint("Salón"),
      GUEST_PAGE_COPY.passVenueHint("Salón"),
    );
  });

  it("states the English plurals and counts a Spanish guest never reads", () => {
    assert.equal(ENGLISH_GUEST_FORMATS.countdownDays(1), "day");
    assert.equal(ENGLISH_GUEST_FORMATS.countdownDays(3), "days");
    assert.equal(ENGLISH_GUEST_FORMATS.partyLimitNote(1), "Seats for 1 person.");
    assert.equal(ENGLISH_GUEST_FORMATS.albumCount(1), "1 photo published");
    assert.equal(ENGLISH_GUEST_FORMATS.albumCount(12), "12 photos published");
    assert.equal(ENGLISH_GUEST_FORMATS.seatsSentence(1), "You have 1 seat reserved in your name.");
    assert.equal(ENGLISH_GUEST_FORMATS.answerCurrentYes(1), "You told us 1 person is coming.");
    assert.equal(ENGLISH_GUEST_FORMATS.answerCurrentYes(3), "You told us 3 people are coming.");
    assert.equal(
      ENGLISH_GUEST_FORMATS.mapAltSeveral(["Ceremony", "Reception"]),
      "Map of Ceremony and Reception.",
    );
    assert.equal(
      ENGLISH_GUEST_FORMATS.countdownSentence([
        { value: 2, unit: "days" },
        { value: 1, unit: "hour" },
      ]),
      "To go: 2 days and 1 hour",
    );
    assert.equal(
      SPANISH_GUEST_FORMATS.countdownSentence([
        { value: 1, unit: "día" },
        { value: 2, unit: "horas" },
      ]),
      "Faltan 1 día y 2 horas",
    );
  });
});
