import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createElement } from "react";
import { renderToString } from "react-dom/server";

import { interactiveSnapshot, serverSnapshot, useInteractive } from "./interactive.ts";

// Controls that act only through JavaScript wait until the page is interactive (M2 T8e; S42).

function SubmitProbe() {
  return createElement("button", { disabled: !useInteractive(), type: "submit" }, "Continuar");
}

describe("useInteractive", () => {
  it("renders a control disabled on the server, before the page is interactive", () => {
    assert.equal(
      renderToString(createElement(SubmitProbe)),
      '<button disabled="" type="submit">Continuar</button>',
    );
  });

  it("reads false for the server render and hydration, and true once React runs in the browser", () => {
    assert.equal(serverSnapshot(), false);
    assert.equal(interactiveSnapshot(), true);
  });
});
