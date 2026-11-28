# ADR 0006: Protect an invitation with a hashed shared access code and a signed access token

## Status

Accepted (F13, password-protected invitation; S2.13, L18, with the owner's approval of the security design: «Sí,
apruebo»; the attempt limits revised by L33, the owner's choice «La correcta siempre entra»).

## Context

Until F13 every published invitation was public: the slug was the only secret, and anyone holding the link could read the
page, answer the RSVP, sign the guestbook, and upload a photo. Deluxe owners asked for a way to share an invitation with
the people they meant to invite and nobody else, without creating accounts for guests who will open one page once.

The feature is security-sensitive on the two surfaces that matter most in this repository: it stores an authentication
factor, and it closes every public route of the invitation. Four properties had to hold.

1. The stored value is never the code. A database reader, a backup, a log line, or an error message must not be able to
   replay it, and the same code must hash differently for two invitations.
2. The gate is the API's, not the web's. A locked invitation must not send its content, its guests, its photos, or its
   answers to a client that then hides them, and a public write must not reach the database on a locked request.
3. A change of code ends every access granted before it, and no client can extend its own access.
4. Guessing must cost something, and a refusal must say nothing. A wrong code, an unknown invitation, and an exhausted
   budget must not be distinguishable by a body, a status family, or a timing difference.

## Decision

1. The code is a shared access code, and it lives on the invitation.
   It is 4 to 40 characters, trimmed, with no control character
   (`apps/api/src/invitations/domain/invitation-password.ts`). It is never a user credential: it names no person, it is
   shared by every guest of one invitation, and it grants nothing beyond that invitation's public page. It is stored on
   `Invitation` (`passwordHash`, `passwordVersion`) and not on `InvitationFeatureSettings`, because the feature settings
   are writable through the features `PUT` by a collaborator holding `EDIT_CONTENT`, and the code decides who may see the
   invitation at all. Its two routes are owner-only.

2. The hash is Node's own `crypto.scrypt`, with a fresh salt and a stated cost, encoded in the value.
   `scrypt$<N>$<r>$<p>$<salt>$<key>` with `N=16384`, `r=8`, `p=1`, a 64-byte key, and a random 16-byte salt per password
   (`apps/api/src/invitations/application/invitation-password.ts`). No dependency and no construction of this
   repository's own. The parameters travel inside the stored value, so the cost can be raised later without a migration:
   verification reads the cost each row was written with. Verification is `crypto.timingSafeEqual` over two derived keys
   of the same width; a stored value the verifier cannot parse answers false, which locks the invitation instead of
   opening it, and a stored hash is bounded so a row written around the API cannot make the process allocate without
   limit. That bound and the accepted stored parameters are one rule, not two: the `maxmem` the verifier passes is
   derived from the widest stored `N`, `r`, and `p` it accepts (`128 * r * (N + p + 2)`), so a row the parser accepts can
   never make Node refuse the derivation, and any scrypt failure during verification answers "does not match" (false)
   rather than throwing a status the neutral refusal never uses. The plain value is never stored, logged, or returned;
   the owner sees it once, while setting it.

3. The token is an HMAC-SHA256 over the invitation id, the password version, and the expiry.
   `invaccess1.<version>.<expiry>.<mac>`, keyed with `INVITATION_ACCESS_SECRET`, valid for 30 days
   (`apps/api/src/invitations/application/invitation-access-token.ts`). Three consequences are the whole design:
   the invitation id is signed but never carried, so a token minted for one invitation cannot open another even at the
   same version; the version is signed and compared with the stored one, so a set, replace, or removal invalidates every
   older token; and the expiry is signed, so a client cannot extend it. The comparison is constant-time over two MACs of
   the same width.

4. The gate runs at the HTTP boundary of every public invitation route.
   `InvitationLockGuard` (`apps/api/src/invitations/presentation/invitation-lock.guard.ts`) is declared on both public
   invitation controllers, so a route added later is gated by default. It reads one lock — the invitation id, the hash,
   the version, and the content — and resolves the requested address exactly as the public read does: the current slug
   first, in one query on its unique index, and only a slug no invitation currently holds through
   `InvitationSlugAlias` and its invitation, for a PUBLISHED row. A previous address answers the same lock and no other
   invitation than the page would serve. The locked answer is 423 with the lock state, one display name, and the current
   address a previous one must redirect to (null for a current address); the route's handler never runs on a locked
   request, so no read, write, upload, or opening count happens. The two personal-link routes and the unlock route are
   the only exemptions, declared one by one, and the HTTP suite reads the registered controllers and fails when a public
   route is neither gated nor one of those three. A lock read that fails is an error, never a pass: the guard refuses a
   request it cannot judge instead of serving an invitation that may be locked.

5. The locked answer carries exactly two invitation facts: a display name and, for a renamed address, the current one.
   The celebrant's name, the baby's name, or the couple's two names joined with « y », collapsed to one line and cut to 80
   characters (`lockScreenDisplayName`), or null when the stored content names nobody. Nothing else — no date, no place,
   no message, no guest, no id, no slug of the request, no feature — travels to a locked client, and the display name is
   computed from the stored content alone, so the lock screen says who is celebrating without saying what the invitation
   contains. The redirect target is the current slug when the guest asked for a previous one, so the web sends the browser
   there before drawing the lock screen: the access cookie it sets is scoped to the invitation's own path, and a cookie
   set at a renamed address would never reach the address the invitation is served from.

6. Verification is bounded by a hard ceiling, and the attempt budgets decide only how a refusal answers.
   Three counters live on the shared `RateLimit` table, under keys of their own holding a SHA-256 of the client address
   and, per address, a SHA-256 of the requested address — never the address itself, and never a fact that says whether an
   invitation exists; an address no invitation holds spends them exactly like a known one
   (`apps/api/src/invitations/application/invitation-unlock-rate-limiter.ts`). The **hard ceiling** is 300 verifications per
   15 minutes per client address, whatever requested address each of them names. It is spent before the lock is read and
   before any hashing work, and an attempt over it answers the neutral 429 immediately: that is what bounds the scrypt work
   one caller can buy. It counts verifications and not failures, so a correct code counts too, and it is never refunded.
   The **soft budgets** are 10 failed attempts per 15 minutes per client address and requested address, and 30 failed
   attempts per 15 minutes per client address across every address, so varying the slug cannot buy a fresh budget. They are
   counted before the lock is read as well, but their exhaustion no longer refuses the attempt (L33, the owner's choice
   «La correcta siempre entra» after 10 failures from one address left even the right code waiting 15 minutes, so a shared
   venue Wi-Fi could block guests). Once either is spent the code is still verified: a right code opens and refunds the
   counts it spent, exactly as before, so a family sharing one venue address is never locked out by its own failures or its
   own correct unlocks, and a wrong code answers the same neutral body with 429 instead of 401, so the over-limit state
   stays observable to the guest. Only a failed attempt stays counted, and one correct code does not reset an almost-spent
   budget. A value no code can be — not a string, wider than the domain maximum of 40 characters, shorter than its minimum
   of 4, or carrying a control character — answers the neutral refusal before the ceiling, the budgets, the lock read, and
   the hasher, so a request that could never open an invitation costs nothing. When no client address resolves, neither
   cap that spans every address is spent — neither the cross-address failures nor the ceiling of verifications: the public
   forms hash the shared `unknown` value into a key that also names their invitation, so their fallback bucket spans one
   invitation, and a bucket that spanned every invitation would let one caller exhaust every guest's budget or every
   guest's ceiling. The per-address budget still applies. A wrong code, an address no invitation holds, and an invitation
   with no code answer one neutral body `{ code: "INVITATION_PASSWORD_REJECTED" }`, after the same scrypt work — a dummy
   verification keeps the timing of the "nothing to verify" paths — and only the status differs: 401 for a code refused
   inside the soft budgets, 429 once a soft budget is spent or the ceiling is exceeded, which is the pattern the open RSVP
   and the guestbook already use for their own per-address limits. The unlock answer is a token and its expiry; nothing
   about the invitation comes back with it.

7. The token travels in a header and the web keeps it out of reach of scripts.
   `X-Invitation-Access` on the public routes, set by the web from its own `HttpOnly`, `Secure`, `SameSite=Lax` cookie
   scoped to that invitation's path. The API stores nothing about the session, so no server-side state has to be expired:
   the token is its own proof, and the password version is what revokes it.

8. The capability is catalog data.
   The new `PASSWORD_PROTECTION` key, granted to Deluxe by the additive migration and declared in the seed, gates
   *setting* a code: a package that does not grant it answers 409 `PASSWORD_PROTECTION_NOT_AVAILABLE` and stores nothing.
   A stored code keeps protecting its invitation after the key is withdrawn, because a lock that disappeared when a
   catalog link was removed would publish an invitation its owner had deliberately closed; the owner can still remove it,
   which is an explicit act and not a side effect of a catalog change.

## Consequences

- The invitation id, the password version, and the expiry are the only facts the token binds. Rotating
  `INVITATION_ACCESS_SECRET` ends every guest's unlock at once, and there is no previous-key window; a rotated code or a
  removal ends the tokens of one invitation. Both are documented in the runbook.
- Every public invitation request costs one extra lock read (one query for a current address, two when the address is a
  previous one). That is deliberate: the gate must know whether the invitation is locked before the route reads, renders,
  or writes anything, and it must do so from stored state rather than from a cached decision, so a code set a second ago
  protects the page on the next request.
- The gate protects the invitation's own routes, not an object's URL. Guest photos and gallery images are served by
  opaque asset ids through `/media/:assetId`, which carries no slug and knows nothing about a password; a locked read
  answers no photo URL at all, so no new id reaches a guest, and an id a guest already had before the code was set keeps
  working exactly as it did. That boundary is stated in the docs rather than implied.
- The calendar file is built by the web from the same public read, so it inherits the gate for free: while the invitation
  is locked the read carries no invitation facts, and the file answers 404.
- The owner's read answers `passwordProtected` and never the code, and the hash never leaves the repository adapter, so
  no projection, log, response, or fixture of a read can carry it.
- The exposure to brute force is bounded by the width of the code, the soft budgets, and the ceiling of verifications,
  not by a lockout: a 4-character code is weak, and the owner is shown that a longer one is better. Since L33 a spent soft
  budget no longer closes the invitation to the guests who know the code — the right code always opens — so what a guesser
  gains is only that an exhausted budget answers 429 instead of 401; the ceiling of 300 verifications per client address
  per 15 minutes is what keeps that from becoming unbounded hashing work. The API refuses to make the code a password with
  account semantics — there is no reset by email, no per-person code, and no second factor, because a guest who loses the
  code asks the owner for it.
- A locked invitation is still discoverable as a slug: the 423 confirms that the address exists and is protected. That is
  the price of drawing a lock screen instead of a 404, and the display name and (for a previous address) the current
  address to redirect to are the only facts it carries.
