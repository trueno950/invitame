/**
 * Thrown when a renderer receives a configuration or a content snapshot that does not fit its contract
 * (T6b; S8). The themed birthday layouts share this one error, so `lib/public/invitation-render.ts` can
 * refuse a drifted snapshot before React renders it. The failure is an operational error — a hand-edited or
 * drifted `TemplateVersion` — never guest input, so it throws and names the renderer and every defect at
 * once. `birthday-adventure-01` keeps its own instance of the same shape and behaviour (unchanged).
 */
export class RendererPropsError extends Error {
  override name = "RendererPropsError";
  readonly issues: string[];

  constructor(componentKey: string, subject: "configuration" | "content", issues: string[]) {
    super(`Invalid ${componentKey} ${subject}: ${issues.join("; ")}`);
    this.issues = issues;
  }
}
