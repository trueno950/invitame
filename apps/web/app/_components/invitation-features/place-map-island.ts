"use client";

import { createElement, useEffect, useRef, useState } from "react";

/**
 * The map of the celebration on a guest page (S1, S2, S3). A guest who never scrolls this far never downloads it:
 * the browser starts observing an empty, fixed-height box, and MapLibre GL and its stylesheet are imported — one
 * dynamic chunk, one request for the tiles — only when that box first comes into view. The box keeps its height from
 * the first paint, so nothing jumps when the map arrives, and it is `aria-hidden`, because it is decorative: the
 * «Cómo llegar» links beside it are the way to the place, the no-script path, and the fallback when MapLibre or the
 * tiles cannot be loaded.
 *
 * It is a `.ts` file with `createElement` for the same reason the block is: `node --test` strips types but does not
 * compile JSX, and the server render of a guest page must be provable without a browser.
 */

/** One marker of the map: the place's name and the point the owner confirmed for it. */
export interface MapMarker {
  readonly label: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
}

/** The style OpenFreeMap serves, an OpenStreetMap-derived vector style with no key and no account. */
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

/**
 * MapLibre resolves its worker from its own module URL, which a bundled client chunk does not give it: the worker of a
 * dev build is asked for as an empty URL and never starts. The bundler emits the worker file beside this chunk and
 * names it here, so the engine runs in every build, and the file is only requested with the engine itself.
 */
const WORKER = new URL(
  "../../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs",
  import.meta.url,
);

/** The zoom a single place is shown at: its neighbourhood, not the whole country. */
const SINGLE_PLACE_ZOOM = 15;

/** How much of the map the bounds of several places leave around them, in pixels. */
const BOUNDS_PADDING = 32;

/** The height the box reserves before the map exists, so the guest page never jumps (S2). */
const CANVAS = "h-56 w-full";

const WRAPPER = "mt-3";
const BOX =
  "relative h-56 w-full overflow-hidden rounded-xl bg-(--inv-soft) ring-1 ring-(color:--inv-accent)/20";

/** The attribution both data sources require: the map data and the tiles, always visible (S2). */
const ATTRIBUTION = "mt-2 text-[0.7rem] leading-4 text-(color:--inv-ink)";

/** What the box says for the guests who cannot see it, in the words of the places it shows. */
function textAlternative(places: readonly MapMarker[]): string {
  return places.length === 1
    ? `Mapa de ${places[0]?.name ?? "la celebración"}.`
    : `Mapa de ${places.map((place) => place.label).join(" y ")}.`;
}

/**
 * The map box of one invitation. It renders no map on the server and none before the box is seen, so the guest page
 * stays a server component with one deliberate, lazy island.
 */
export function PlaceMapIsland({ places }: { readonly places: readonly MapMarker[] }) {
  const canvas = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  // Whether the engine and its tiles could not be loaded: the box then keeps no empty panel a guest cannot use.
  const [unavailable, setUnavailable] = useState(false);

  // The box asks to be loaded when it first comes into view, and stops observing at once: the map is loaded once.
  useEffect(() => {
    const element = canvas.current;

    if (element === null || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = canvas.current;

    if (!visible || container === null) {
      return;
    }

    // A box that comes back — the places of the invitation changed — tries the engine again instead of staying blank.
    setUnavailable(false);

    let cancelled = false;
    let map: { remove(): void; resize(): void } | undefined;
    let resize: ResizeObserver | undefined;

    void (async () => {
      try {
        // Both arrive together and only here: a guest who never reaches this box downloads neither the engine nor
        // its stylesheet.
        const [maplibre] = await Promise.all([
          import("maplibre-gl"),
          import("maplibre-gl/dist/maplibre-gl.css"),
        ]);

        if (cancelled) {
          return;
        }

        // MapLibre resolves its worker from its own module URL, which a Turbopack client chunk does not give it, so
        // the worker's own URL is handed over explicitly: the bundler emits the file beside this chunk in every build.
        maplibre.setWorkerUrl(WORKER.href);

        const first = places[0];

        if (first === undefined) {
          return;
        }

        const bounds = new maplibre.LngLatBounds();
        for (const place of places) {
          bounds.extend([place.lng, place.lat]);
        }

        const instance = new maplibre.Map({
          container,
          style: MAP_STYLE,
          // The page keeps scrolling on a touch screen: a map that traps the gesture would strand a guest inside it.
          cooperativeGestures: true,
          // The attribution is the visible line below, so the control adds no second copy of it.
          attributionControl: false,
          ...(places.length === 1
            ? { center: [first.lng, first.lat] as [number, number], zoom: SINGLE_PLACE_ZOOM }
            : {
                bounds,
                fitBoundsOptions: { padding: BOUNDS_PADDING, maxZoom: SINGLE_PLACE_ZOOM },
              }),
        });

        map = instance;

        // A rotation or a wider screen changes the box: the canvas follows it instead of keeping the first size.
        if (typeof ResizeObserver !== "undefined") {
          resize = new ResizeObserver(() => instance.resize());
          resize.observe(container);
        }

        for (const place of places) {
          new maplibre.Marker()
            .setLngLat([place.lng, place.lat])
            .setPopup(new maplibre.Popup({ offset: 24 }).setText(place.name))
            .addTo(instance);
        }
      } catch {
        // A map that cannot be loaded is not left as an empty box: the «Cómo llegar» links beside it are the way to
        // the place, so the island hides the panel and the line below it rather than showing a blank one.
        setUnavailable(true);
      }
    })();

    return () => {
      cancelled = true;
      resize?.disconnect();
      map?.remove();
    };
  }, [visible, places]);

  // The box of the map holds the canvas and nothing else: its height is reserved from the first paint, and the
  // attribution sits below it, outside the clip, so it is always readable (S2). A box whose engine could not be
  // loaded keeps its canvas mounted for a later attempt, but the panel is no longer shown and it credits no tiles it
  // never received: the «Cómo llegar» links are the whole map for that guest.
  return createElement(
    "div",
    { "data-place-map": "", className: WRAPPER },
    // The canvas is decorative: the links beside it and the line below are what a guest reads.
    createElement(
      "div",
      { "aria-hidden": "true", className: unavailable ? `${BOX} hidden` : BOX },
      createElement("div", { className: CANVAS, ref: canvas }),
    ),
    ...(unavailable
      ? []
      : [
          createElement("p", { className: "sr-only", key: "places" }, textAlternative(places)),
          createElement(
            "p",
            { className: ATTRIBUTION, key: "attribution" },
            "© OpenStreetMap contributors · Mapas: OpenFreeMap",
          ),
        ]),
  );
}
