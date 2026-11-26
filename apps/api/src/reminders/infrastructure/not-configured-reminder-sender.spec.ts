import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NOT_CONFIGURED_REASON } from "../application/reminder-sender";
import { NotConfiguredReminderSender } from "./not-configured-reminder-sender";

// The contract of the default reminder adapter (F6; S6, L9.4): the deployment that has no WhatsApp Business account
// sends nothing, reports «not configured», and never pretends a message left. Turning reminders on needs only
// configuration and another adapter — never a code change in the command (S6).

const MESSAGE = { to: "+525512345678", body: "Hola, Familia Gómez 👋" } as const;

describe("the default reminder adapter (S6, L9.4)", () => {
  it("reports not configured, which is what the owner's screen and the command read", async () => {
    const sender = new NotConfiguredReminderSender();

    assert.equal(sender.isConfigured(), false);
    assert.deepEqual(await sender.send(MESSAGE), {
      status: "skipped",
      reason: NOT_CONFIGURED_REASON,
    });
    assert.equal(NOT_CONFIGURED_REASON, "not_configured");
  });

  it("answers the same outcome every time and changes no state", async () => {
    const sender = new NotConfiguredReminderSender();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      assert.deepEqual(await sender.send(MESSAGE), {
        status: "skipped",
        reason: NOT_CONFIGURED_REASON,
      });
    }
    assert.equal(sender.isConfigured(), false);
  });

  it("answers an outcome that carries no phone and no message body", async () => {
    const sender = new NotConfiguredReminderSender();
    const result = await sender.send(MESSAGE);

    assert.deepEqual(Object.keys(result).sort(), ["reason", "status"]);
    assert.equal(JSON.stringify(result).includes(MESSAGE.to), false);
    assert.equal(JSON.stringify(result).includes(MESSAGE.body), false);
  });
});
