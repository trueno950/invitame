import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ADDRESS_CHECK_STATES,
  ADDRESS_RENAMES_MAX,
  ADDRESS_SLUG_MAX_LENGTH,
  ADDRESS_SLUG_MIN_LENGTH,
  type AddressCheckState,
  type AddressViewInput,
  addressCheckState,
  addressDisplayState,
  addressHint,
  addressLine,
  addressPrefix,
  addressPreview,
  addressSaveHint,
  addressStateLabel,
  canSaveAddress,
  normalizeAddressInput,
  renamesRemainingLabel,
} from "./address.ts";
import { ADDRESS_COPY } from "./copy.ts";

// The custom invitation address in the editor (F11; S2.11, L15.1, L15.3, L15.4). What this module owns is the pure
// part of the block the artboard draws: the configured prefix, the text the owner's input becomes, and the wording of
// every state. The rule itself is the API's, so the browser never decides that an address is available by itself.

describe("addressPrefix", () => {
  it("draws the real origin from configuration without its scheme", () => {
    assert.equal(addressPrefix("https://invitame.mx"), "invitame.mx/i/");
    assert.equal(addressPrefix("https://invitame.mx/"), "invitame.mx/i/");
    assert.equal(addressPrefix("http://localhost:3000"), "localhost:3000/i/");
  });

  it("has no prefix to show when the origin is unknown", () => {
    for (const origin of [undefined, "", "  "]) {
      assert.equal(addressPrefix(origin), "/i/", String(origin));
    }
  });
});

describe("addressPreview", () => {
  it("joins the prefix and the address the owner typed", () => {
    assert.equal(addressPreview("invitame.mx/i/", "valentina-xv"), "invitame.mx/i/valentina-xv");
    assert.equal(addressPreview("/i/", ""), "/i/");
  });
});

describe("normalizeAddressInput", () => {
  it("lower-cases what the owner typed and keeps inner hyphens", () => {
    assert.equal(normalizeAddressInput("  Valentina-XV "), "valentina-xv");
    assert.equal(normalizeAddressInput("ANA Y BETO"), "ana y beto");
  });

  it("never trims inside the address, and keeps it a single line", () => {
    assert.equal(normalizeAddressInput("boda\n2027"), "boda2027");
  });
});

describe("addressStateLabel", () => {
  it("names every state in words, never in color alone", () => {
    assert.equal(addressStateLabel("available"), "✓ Disponible");
    assert.equal(addressStateLabel("taken"), "Ya está en uso");
    assert.equal(addressStateLabel("invalid"), "No es válida");
  });

  it("says what a reserved word and a refused check mean", () => {
    assert.equal(addressStateLabel("reserved"), "No está disponible");
    assert.equal(addressStateLabel("rate-limited"), "Espera un momento y vuelve a intentarlo.");
    assert.equal(
      addressStateLabel("unavailable"),
      "No pudimos revisarla ahora. Inténtalo de nuevo.",
    );
  });

  it("says nothing while there is nothing to say", () => {
    assert.equal(addressStateLabel("idle"), "");
    assert.equal(addressStateLabel("checking"), "Revisando…");
  });

  it("covers the four answers the API gives plus the browser's own states", () => {
    assert.deepEqual(
      [...ADDRESS_CHECK_STATES],
      [
        "idle",
        "checking",
        "available",
        "taken",
        "invalid",
        "reserved",
        "rate-limited",
        "unavailable",
      ],
    );
  });
});

describe("addressCheckState", () => {
  it("maps the API's own words", () => {
    assert.equal(addressCheckState("available"), "available");
    assert.equal(addressCheckState("taken"), "taken");
    assert.equal(addressCheckState("invalid"), "invalid");
    assert.equal(addressCheckState("reserved"), "reserved");
  });

  it("maps a refusal and an outage to the states the block explains", () => {
    assert.equal(addressCheckState("slug-rate-limited"), "rate-limited");
    assert.equal(addressCheckState("unavailable"), "unavailable");
    assert.equal(addressCheckState("not-found"), "unavailable");
    assert.equal(addressCheckState("something-else"), "unavailable");
  });
});

describe("addressHint", () => {
  it("states the rule the API applies", () => {
    assert.match(addressHint(), /3 a 40 caracteres/u);
    assert.match(addressHint(), /minúsculas/u);
    assert.match(addressHint(), /guiones/u);
  });
});

describe("renamesRemainingLabel", () => {
  it("says how many renames are left", () => {
    assert.equal(renamesRemainingLabel(5), "Te quedan 5 cambios de dirección.");
    assert.equal(renamesRemainingLabel(1), "Te queda 1 cambio de dirección.");
  });

  it("says plainly that no rename is left", () => {
    assert.equal(renamesRemainingLabel(0), "Ya no puedes cambiar la dirección.");
  });

  it("states the bound the product promises", () => {
    assert.equal(ADDRESS_RENAMES_MAX, 5);
  });
});

// What the block shows under and around the field (F11; L15.4): one answer per state, one line naming the address the
// owner is looking at, and a sentence that says why the save is off. The artboard's own words are the source of the
// copy, and the API's answer is the only thing that ever allows a save.

const view = (overrides: Partial<AddressViewInput> = {}): AddressViewInput => ({
  state: "idle",
  checked: "",
  remaining: 3,
  savedSlug: "ana-y-beto",
  value: "",
  ...overrides,
});

/** Every state the block can render, so a rule that names one is checked against all of them. */
const EVERY_STATE: readonly AddressCheckState[] = ADDRESS_CHECK_STATES;

describe("addressDisplayState", () => {
  it("says nothing while the field holds the stored address or nothing at all", () => {
    assert.equal(addressDisplayState(view({ checked: "ana-y-beto", value: "ana-y-beto" })), "idle");
    assert.equal(addressDisplayState(view({ value: "" })), "idle");
    assert.equal(addressDisplayState(view({ value: "   " })), "idle");
  });

  it("shows the state the server answered for exactly the typed address", () => {
    for (const state of EVERY_STATE.filter((value) => value !== "idle")) {
      assert.equal(
        addressDisplayState(view({ state, checked: "valentina", value: "valentina" })),
        state,
        state,
      );
    }
  });

  it("never shows a stale answer while the owner types a different address", () => {
    assert.equal(
      addressDisplayState(view({ state: "available", checked: "valentina", value: "valentina2" })),
      "checking",
    );
    assert.equal(
      addressDisplayState(view({ state: "taken", checked: "valentina", value: "valentina2" })),
      "checking",
    );
  });

  it("asks again for a value whose answer was thrown away by clearing the field", () => {
    assert.equal(
      addressDisplayState(view({ state: "idle", checked: "valentina", value: "valentina" })),
      "checking",
    );
  });

  it("shows the answer for the value as it is normalized, so it survives trailing spaces", () => {
    assert.equal(
      addressDisplayState(view({ state: "available", checked: "valentina", value: " Valentina " })),
      "available",
    );
  });
});

describe("canSaveAddress", () => {
  const available = view({ state: "available", checked: "valentina", value: "valentina" });

  it("allows the save only when the server answered ✓ Disponible", () => {
    assert.equal(canSaveAddress(available), true);
    for (const state of EVERY_STATE.filter((value) => value !== "available")) {
      assert.equal(canSaveAddress({ ...available, state }), false, state);
    }
  });

  it("refuses the address that is already stored, because it is nothing to save", () => {
    assert.equal(
      canSaveAddress({ ...available, checked: "ana-y-beto", value: "ana-y-beto" }),
      false,
    );
  });

  it("refuses a value the server did not answer, even when it answers available", () => {
    assert.equal(canSaveAddress({ ...available, value: "valentina2" }), false);
    assert.equal(canSaveAddress({ ...available, checked: "" }), false);
  });

  it("refuses an empty field", () => {
    assert.equal(canSaveAddress({ ...available, checked: "", value: "  " }), false);
  });

  it("refuses once no rename is left", () => {
    assert.equal(canSaveAddress({ ...available, remaining: 0 }), false);
  });
});

describe("addressLine", () => {
  const prefix = "invitame.mx/i/";

  it("names the address the invitation has today", () => {
    assert.equal(
      addressLine(view({ value: "ana-y-beto" }), prefix),
      "Tu dirección actual: invitame.mx/i/ana-y-beto",
    );
  });

  it("keeps the current address while an empty field is being typed", () => {
    assert.equal(
      addressLine(view({ value: "" }), prefix),
      "Tu dirección actual: invitame.mx/i/ana-y-beto",
    );
    assert.equal(
      addressLine(view({ value: "  " }), prefix),
      "Tu dirección actual: invitame.mx/i/ana-y-beto",
    );
  });

  it("previews the typed address once it is available", () => {
    assert.equal(
      addressLine(view({ state: "available", checked: "valentina", value: "valentina" }), prefix),
      "Así quedará: invitame.mx/i/valentina",
    );
  });

  it("never shows an unavailable value as an address", () => {
    for (const state of EVERY_STATE.filter((value) => value !== "available")) {
      assert.equal(
        addressLine(view({ state, checked: "valentina", value: "valentina" }), prefix),
        "Tu dirección actual: invitame.mx/i/ana-y-beto",
        state,
      );
    }
    assert.equal(
      addressLine(view({ state: "available", checked: "valentina", value: "valentina2" }), prefix),
      "Tu dirección actual: invitame.mx/i/ana-y-beto",
    );
  });
});

describe("addressSaveHint", () => {
  it("asks for an address while the field is empty", () => {
    assert.equal(
      addressSaveHint(view({ value: "" })),
      "Escribe una dirección para poder guardarla.",
    );
  });

  it("explains that the stored address is already the invitation's", () => {
    assert.match(
      addressSaveHint(view({ value: "ana-y-beto" })),
      /ya es la dirección de tu invitación/u,
    );
  });

  it("says the save waits for the check", () => {
    assert.match(addressSaveHint(view({ value: "valentina" })), /comprobación|revis/u);
    assert.match(
      addressSaveHint(view({ state: "available", checked: "valentina", value: "valentina2" })),
      /comprobación|revis/u,
    );
  });

  it("says why an unreachable check blocks the save", () => {
    assert.notEqual(
      addressSaveHint(view({ state: "unavailable", checked: "valentina", value: "valentina" })),
      "",
    );
  });

  it("adds nothing when the state under the field already says why", () => {
    for (const state of ["taken", "invalid", "reserved", "rate-limited"] as const) {
      assert.equal(
        addressSaveHint(view({ state, checked: "valentina", value: "valentina" })),
        "",
        state,
      );
    }
  });

  it("adds nothing when the save is allowed", () => {
    assert.equal(
      addressSaveHint(view({ state: "available", checked: "valentina", value: "valentina" })),
      "",
    );
  });

  it("adds nothing when no rename is left, because the block says so instead of offering the save", () => {
    assert.equal(addressSaveHint(view({ remaining: 0, value: "valentina" })), "");
  });
});

describe("the copy of the block", () => {
  it("asks the owner for the address and offers the save", () => {
    assert.equal(ADDRESS_COPY.heading, "Dirección de tu invitación");
    assert.equal(ADDRESS_COPY.lead, "Elige una dirección fácil de recordar y de compartir.");
    assert.equal(ADDRESS_COPY.label, "Tu dirección");
    assert.equal(ADDRESS_COPY.save, "Guardar dirección");
  });

  it("keeps the promise that an already shared link still works", () => {
    assert.equal(ADDRESS_COPY.previousLinkNote, ADDRESS_COPY.previousLinkNote);
    assert.match(ADDRESS_COPY.previousLinkNote, /seguirá funcionando/u);
  });

  it("states the rule's bounds as the same numbers the rule has", () => {
    assert.equal(ADDRESS_SLUG_MIN_LENGTH, 3);
    assert.equal(ADDRESS_SLUG_MAX_LENGTH, 40);
  });

  it("names the current address and the one the owner is about to save", () => {
    assert.equal(
      ADDRESS_COPY.currentAddress("invitame.mx/i/ana-y-beto"),
      "Tu dirección actual: invitame.mx/i/ana-y-beto",
    );
    assert.equal(
      ADDRESS_COPY.nextAddress("invitame.mx/i/valentina"),
      "Así quedará: invitame.mx/i/valentina",
    );
  });

  it("asks for an address in the second person", () => {
    assert.match(ADDRESS_COPY.needAddress, /^Escribe una dirección/u);
  });
});
