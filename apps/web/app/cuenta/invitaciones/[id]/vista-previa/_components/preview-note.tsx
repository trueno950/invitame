/**
 * The short note the owner's preview shows when it has nothing to render (T2b; S4): the pinned template version
 * left the creator catalog, the catalog could not be read, or the renderer refuses the snapshot. It carries no
 * navigation — the preview is meant for the editor's frame, not for reading on its own — and it never guesses what
 * the invitation would look like.
 */
export function PreviewNote({ heading, body }: { heading: string; body: string }) {
  return (
    <main className="paper-wash relative isolate flex min-h-screen items-center justify-center px-4 py-10 text-ink sm:px-8">
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-2.5 rounded-panel bg-surface/85 px-5 py-8 text-center shadow-soft ring-1 ring-gold/45 sm:px-8 sm:py-10">
        <h1 className="font-display text-[1.375rem] font-semibold leading-tight text-balance text-ink">
          {heading}
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-pretty text-muted">{body}</p>
      </div>
    </main>
  );
}
