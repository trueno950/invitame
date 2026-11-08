import type {
  OwnProfile,
  OwnProfileRepository,
} from "../src/users/application/own-profile.repository";

type Row = Record<string, unknown>;

/**
 * The own-profile port on Better Auth's in-memory user rows, shared by the suites that run without a
 * database. `name` is stored as `displayName` (`user.fields`), and an empty name reads as null, as in
 * `PrismaOwnProfileRepository`.
 */
export class MemoryOwnProfileRepository implements OwnProfileRepository {
  constructor(private readonly users: () => Row[]) {}

  async findById(userId: string): Promise<OwnProfile | null> {
    const row = this.users().find((user) => user.id === userId);
    return row ? toProfile(row) : null;
  }

  async updateDisplayName(userId: string, displayName: string | null): Promise<OwnProfile | null> {
    const row = this.users().find((user) => user.id === userId);
    if (!row) {
      return null;
    }
    row.displayName = displayName;
    return toProfile(row);
  }
}

function toProfile(row: Row): OwnProfile {
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: (row.displayName as string | null) || null,
    role: row.role as OwnProfile["role"],
  };
}
