"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
  useTransition,
} from "react";

import type { AutosaveQueueState } from "../../../../../lib/customer/autosave-queue.ts";
import type { EditorSection } from "../../../../../lib/customer/editor-sections.ts";
import { EDITOR_SECTION_PARAM } from "../../../../../lib/customer/editor-sections.ts";

/**
 * The one navigation guard of the invitation editor (T2c; S2, S4). Every action that still navigates — the main photo
 * upload, the gallery upload, an alt text, a move, a remove, «Pagar y publicar», «Publicar», «Despublicar»,
 * «Archivar», and the links to the answers page — runs through this module, so a typed value is never discarded by a
 * submit that reloads the page.
 *
 * A control asks `useGuardedNavigation()` to run its navigation: when nothing is unsaved it runs at once; when a field
 * is still on its way the editor flushes and runs the navigation as soon as the queue is settled; and when the save
 * failed the navigation does not happen at all and the focus moves to the status line, which already says «No se pudo
 * guardar · Reintentar». The pending navigation lives in the provider, not in the control, so switching tabs while a
 * flush is in flight never swallows it.
 */

/** What the editor's navigating controls read from its autosave. */
export interface AutosaveBridge {
  /** The queue's state, so a pending navigation can wait for it to settle. */
  readonly state: AutosaveQueueState;
  /** Whether anything is pending, in flight, or failed. */
  readonly unsaved: boolean;
  /** Saves everything pending at once, as a blur does. */
  flush(): Promise<void>;
  /** Moves the focus to the status line, so a blocked submit points at the line that explains it. */
  focusStatus(): void;
}

type GuardedNavigation = (navigate: () => void) => void;

const BridgeContext = createContext<GuardedNavigation | undefined>(undefined);

/**
 * Owns the queue a navigation waits for. The editor wraps its whole island (fields, gallery, publish panel, preview)
 * in it, so a server-rendered form deep inside can be guarded without knowing the autosave exists.
 */
export function AutosaveBridgeProvider({
  bridge,
  children,
}: {
  bridge: AutosaveBridge | undefined;
  children: ReactNode;
}) {
  const [pending, setPending] = useState<(() => void) | undefined>(undefined);
  const state = bridge?.state;

  useEffect(() => {
    if (pending === undefined) {
      return;
    }
    // A change the creator typed while the flush was on its way is still being saved: wait for that answer too.
    if (state !== undefined && (state.kind === "dirty" || state.kind === "saving")) {
      return;
    }

    setPending(undefined);

    if (state !== undefined && state.kind === "error") {
      bridge?.focusStatus();
      return;
    }
    pending();
  }, [pending, state, bridge]);

  const run = useCallback<GuardedNavigation>(
    (navigate) => {
      if (bridge === undefined) {
        navigate();
        return;
      }
      if (bridge.state.kind === "error") {
        bridge.focusStatus();
        return;
      }
      if (!bridge.unsaved) {
        navigate();
        return;
      }

      setPending(() => navigate);
      void bridge.flush();
    },
    [bridge],
  );

  return <BridgeContext.Provider value={run}>{children}</BridgeContext.Provider>;
}

/** The way one control asks for a navigation that never discards what the owner typed. */
export function useGuardedNavigation(): GuardedNavigation {
  const run = useContext(BridgeContext);

  // Outside the editor (an archived draft's summary page) there is nothing to flush and nothing to wait for.
  return run ?? ((navigate) => navigate());
}

export interface GuardedFormProps {
  /** The server action the form posts. It is called from the browser once everything typed is stored. */
  action: (formData: FormData) => Promise<void>;
  /** The tab the redirect comes back to, which the editor's actions read from the submitted form. */
  section?: EditorSection;
  /**
   * Whether the browser posts this form itself once the autosave is settled, instead of the editor calling the action
   * from the browser (F13; L18.1). A form whose action hands one value over to the page it redirects to needs it: an
   * action called from the browser answers with that page, and Next.js then navigates there and renders it again, so a
   * value the first render took out of its one-time store is never painted. A native form is a real post the browser
   * follows, so the page the owner lands on is the only render.
   */
  native?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * A form whose submit waits for the autosave. The form itself stays a plain form: its fields, its hidden ids, and its
 * file input are the ones the server action already reads, and one hidden field names the tab the owner came back to.
 * A `native` form is posted by the browser — Next.js renders the action as the form's own endpoint — and the others call
 * the action from the browser, which keeps the editor on its page while it works.
 */
export function GuardedForm({ action, section, native, className, children }: GuardedFormProps) {
  const navigate = useGuardedNavigation();
  const [, startTransition] = useTransition();

  return (
    <form
      action={native ? action : undefined}
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        // Read the form before the wait: the file input of an upload keeps its file, and the element outlives the flush.
        const element = event.currentTarget;

        if (native === true) {
          // The browser's own post: it follows the 303 the action redirects with, so the page it lands on renders once.
          navigate(() => element.submit());
          return;
        }

        const submitted = new FormData(element);

        navigate(() => {
          // A server action that redirects is called inside a transition, as Next.js expects of a client submit.
          startTransition(() => {
            void action(submitted);
          });
        });
      }}
    >
      {section === undefined ? null : (
        <input name={EDITOR_SECTION_PARAM} type="hidden" value={section} />
      )}
      {children}
    </form>
  );
}

export interface GuardedLinkProps {
  href: string;
  className?: string;
  /** A link that opens its own tab never navigates this page, so it needs no flush. */
  target?: string;
  rel?: string;
  children: ReactNode;
}

/** A link to another page of the account that waits for the autosave before it leaves. */
export function GuardedLink({ href, className, target, rel, children }: GuardedLinkProps) {
  const navigate = useGuardedNavigation();
  const router = useRouter();

  return (
    <Link
      className={className}
      href={href}
      onClick={(event) => {
        if (
          target === "_blank" ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        event.preventDefault();
        navigate(() => router.push(href));
      }}
      rel={rel}
      target={target}
    >
      {children}
    </Link>
  );
}
