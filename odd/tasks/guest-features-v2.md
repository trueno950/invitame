# Guest features v2

Close the feature gap against the market (Mexican digital invitation services and Joy/Zola/Paperless Post/Greenvelope),
one feature at a time, in priority order. Each feature gets design directions, the owner's pick, implementation,
verification, CI, and its own merge to `master` before the next starts.

## Specs

- S1 — Owner, verbatim: "el del dominio si descartalo el de recordatorios por whatsapp lo puedes implementar pero lo
  podemos dejar pendiente y activarlo luego cuando tengamos para pagar la subs de sms si ese no, arranca por todos, epro
  en orden de prioridad"
- S2 — Scope and order (owner approved the package column, «Sí, así»): 1 itinerary (all packages); 2 gift registry with
  several links and bank transfer details (Deluxe); 3 RSVP with companion names, children, and dietary restrictions
  (Premium, Deluxe); 4 lodging and transport (Premium, Deluxe); 5 table number on the guest pass (Deluxe); 6 WhatsApp
  reminders, built but switched off until the owner activates a provider subscription (Deluxe); 7 guestbook (Premium,
  Deluxe); 8 guest photo album with QR upload and moderation (Deluxe); 9 livestream link (Premium, Deluxe); 10 opening
  animation (all); 11 custom invitation address `/i/<name>` (all); 12 co-hosts (Premium, Deluxe); 13 password-protected
  invitation (Deluxe); 14 English invitation (all). Discarded: custom domain per customer, SMS.
- S3 — Owner: «Propuestas en todas» — every feature starts with design directions under `design/<slug>/` and waits for
  the owner's pick.
- S4 — Owner: «Una por una a master» — each feature is finished, verified, passes CI, and merges before the next one.
- S5 — Package gating is data: each new capability is a catalog feature key granted by packages (`AGENTS.md`: feature
  keys never select code paths by name; behavior lives behind an allow-listed implementation), editable from the
  administration panel.
- S6 — Paid providers stay behind ports: WhatsApp reminders use a provider port whose default adapter sends nothing
  and reports «not configured»; turning it on needs only configuration, never code.

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| F1 | Itinerary | S2.1, S3-S5 | design → worker | |
| F2 | Gift registry with several links and transfer details | S2.2, S3-S5 | design → worker | |
| F3 | RSVP with companions, children, dietary restrictions | S2.3, S3-S5 | design → worker | |
| F4 | Lodging and transport | S2.4, S3-S5 | design → worker | |
| F5 | Table number on the guest pass | S2.5, S3-S5 | design → worker | |
| F6 | WhatsApp reminders (switched off) | S2.6, S3-S6 | design → worker | |
| F7 | Guestbook | S2.7, S3-S5 | design → worker | |
| F8 | Guest photo album | S2.8, S3-S5 | design → worker | |
| F9 | Livestream link | S2.9, S3-S5 | design → worker | |
| F10 | Opening animation | S2.10, S3, S4 | design → worker | |
| F11 | Custom invitation address | S2.11, S3, S4 | design → worker | |
| F12 | Co-hosts | S2.12, S3-S5 | design → worker | |
| F13 | Password-protected invitation | S2.13, S3-S5 | design → worker | |
| F14 | English invitation | S2.14, S3, S4 | design → worker | |

## Log

- L1 — Owner request, verbatim: see S1. Market comparison and running-cost review delivered in conversation before it.
- L2 — F1 design decision (parent): the itinerary is per-invitation feature data shown in the shared features block, so
  one implementation serves all eleven layouts and no template version changes; gated by a new feature key granted to
  every package.
