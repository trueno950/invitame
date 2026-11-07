import { useSyncExternalStore } from "react";

/**
 * Whether the page is interactive, that is, whether React runs in this browser and its event handlers
 * are attached (M2 T8e; S42). The server render and the hydration pass read `false`; React then
 * renders again with `true`. A component mounted later, after a client-side navigation, reads `true`
 * at once.
 *
 * Controls that act only through JavaScript stay disabled while this is `false`: an early click then
 * neither submits the form natively, which would put its fields in the URL, nor does nothing silently,
 * and a disabled default button also blocks the implicit submission of a form by Enter.
 */
export function useInteractive(): boolean {
  return useSyncExternalStore(subscribe, interactiveSnapshot, serverSnapshot);
}

/** Nothing to observe: the value changes once, when React takes over the server-rendered page. */
function subscribe(): () => void {
  return () => {};
}

export function interactiveSnapshot(): boolean {
  return true;
}

export function serverSnapshot(): boolean {
  return false;
}
