import type { Prisma } from "@prisma/client";

import type { AdminActionEntry } from "./domain/admin-action";

// The one public contract of the `admin` module (M9 T6; S4, S6, L9): one append-only audit row per state-changing
// support action. It is deliberately infrastructure-shaped, because the transaction is the point — `record` takes the
// caller's own Prisma transaction client, so the module that owns the change writes its change and the audit row in
// one transaction (L9 «Misma transacción»). A caller in another module injects this contract and never reaches
// `prisma.adminAction` itself; the module owns the table and this is its only door.

/**
 * The vocabulary of the entry a caller builds — the closed sets, the note's bound, and the refusal the domain states —
 * re-exported here so the module that owns a changed resource imports the public contract alone and never this
 * module's domain files. Nothing here writes a row: the values are the ones `record` validates against.
 */
export {
  ADMIN_ACTION,
  ADMIN_ACTION_NOTE_MAX_LENGTH,
  ADMIN_ACTION_REASON,
  type AdminActionEntry,
  type AdminActionReason,
  type AdminActionType,
} from "./domain/admin-action";
export { InvalidAdminActionError } from "./domain/admin-action.errors";

/** One stored audit row as its caller may use it: the id and the instant the database stamped. */
export interface RecordedAdminAction {
  readonly id: string;
  readonly createdAt: Date;
}

/** The audit recorder: validate one entry, then insert it with the caller's transaction. */
export interface AdminActionRecorder {
  /**
   * Validates `entry` — the closed sets, the trimmed and bounded note, the single target the action names — and
   * inserts the row through `tx`, never opening a transaction of its own. An entry the domain refuses throws
   * `InvalidAdminActionError` before any statement runs, so a refused action stores neither its change nor an audit
   * row. The database's CHECK constraints and its append-only trigger stay the guards behind this method.
   */
  record(tx: Prisma.TransactionClient, entry: AdminActionEntry): Promise<RecordedAdminAction>;
}

export const ADMIN_ACTION_RECORDER = Symbol("AdminActionRecorder");
