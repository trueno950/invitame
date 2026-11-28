import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// The ready-to-share message of a saved access code is a one-time value (F13; L18.1): the action keeps it in this
// process's store and the editor takes it out as it renders, so it must be read by the render the owner actually sees.
// A server action called from the browser answers with the page it redirects to, and Next.js then navigates there and
// renders that page again: the first render took the message and the painted one found nothing, which is why the line
// never appeared beside «Contraseña activa» (defect found in the browser check of T13). The block therefore hands its
// save form to the browser as a plain form post — the browser follows the action's 303 and the page it lands on is the
// single render that takes the message — and this test pins that wiring, because neither half of it can be reached from
// `node --test` otherwise: one is a client component and the other is the markup it renders.
//
// Extraction contract, on `password-field.tsx`: a `<GuardedForm>` that saves a code carries the `native` flag, so the
// browser posts it. On `navigation-guard.tsx`: the form element of a native `GuardedForm` carries the action, which is
// what Next.js renders as the form's own endpoint. A refactor that changes either shape must keep both facts, or the
// message is consumed by a render nobody sees again.

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const BLOCK = stripComments(readFileSync(new URL("./password-field.tsx", import.meta.url), "utf8"));
const GUARD = stripComments(
  readFileSync(new URL("../../_components/autosave/navigation-guard.tsx", import.meta.url), "utf8"),
);

describe("the block that shows a saved code once (F13; L18.1)", () => {
  it("posts its save form natively, so the page the owner lands on takes the message", () => {
    const guarded: string[] = BLOCK.match(/<GuardedForm\b[^>]*>/g) ?? [];

    assert.ok(
      guarded.length > 0,
      "no form of the block goes through the editor's navigation guard",
    );

    const saveForms = guarded.filter((form) => /\baction=\{action\}/.test(form));

    assert.ok(saveForms.length > 0, guarded.join("\n"));
    for (const form of saveForms) {
      assert.match(form, /\bnative\b/, `the form that saves the code must post natively: ${form}`);
    }
  });

  it("gives that form the action Next.js renders as the form's own endpoint", () => {
    assert.match(
      GUARD,
      /action=\{native \? action : undefined\}/,
      "a native form of the guard must carry the action it posts",
    );
  });
});
