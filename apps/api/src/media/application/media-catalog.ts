// What the media module needs from the catalog (M8 S4): whether the invitation's pinned package grants `GALLERY`.
// This is a deliberate public application contract, as `docs/architecture/module-template.md` requires: the media
// module never imports a catalog repository or queries a catalog table. The catalog owns the read and exposes it
// through its own public contract; `media.module.ts` binds this port to it. Feature keys are data compared by
// equality, never names that select behavior (AGENTS.md).

/** The feature gate a gallery upload reads: the included catalog keys of the pinned package. */
export interface MediaCatalog {
  /** The included feature keys of the package; null when no package has this id, which grants nothing. */
  findPackageEntitlements(
    packageId: string,
  ): Promise<{ includedFeatureKeys: readonly string[] } | null>;
}

export const MEDIA_CATALOG = Symbol("MediaCatalog");
