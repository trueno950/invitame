import type { EmailEnvironment } from "../../config/environment";
import type { EmailSender } from "../application/email-sender.port";
import { InMemoryEmailSender } from "./in-memory-email-sender";
import { MailpitEmailSender } from "./mailpit-email-sender";
import { ResendEmailSender } from "./resend-email-sender";

/** Selects the adapter for the validated transport; the configuration already fails closed. */
export function createEmailSender(settings: EmailEnvironment): EmailSender {
  switch (settings.transport) {
    case "resend":
      return new ResendEmailSender({ apiKey: settings.resendApiKey, from: settings.from });
    case "mailpit":
      return new MailpitEmailSender({ baseUrl: settings.mailpitUrl, from: settings.from });
    case "memory":
      return new InMemoryEmailSender();
  }
}
