import { createElement, type ReactElement } from "react";

import {
  type CutSheet,
  cutSheets,
  grain,
  sheetDefinitions,
  type ThemePaint,
  tornEdge,
} from "./primitives.ts";
import type { IllustrationId, ThemeIllustration } from "./types.ts";

/*
 * «Bajo el mar» in paper cut-out (I3b, I4c; S1-S5), after the technique of `dinosaurs.ts` and the owner's
 * artboard `design/theme-illustrations/01-papel-recortado.html`. The owner asked for richer birthday scenes
 * (S5, L6), so the header is now a layered reef in four depth planes: the surface waves and four shafts of
 * light over the open water, a far reef ridge with its faded kelp, a school of small fish with a jellyfish
 * above them, a sea turtle and a large fish in the middle water, a treasure chest with its coins and bubbles on
 * the sand, and a foreground of kelp fronds, corals, shells and sea stars. The sand carries three ripple lines
 * and the pebbles the tide left; the bubbles rise in three depths.
 *
 * Original work: every animal is a plain paper shape of our own — a turtle with a plated shell, a jellyfish
 * with a scalloped bell, a fish with rayed fins and a school of small ones — and there is no clownfish stripe,
 * no character, and no logo of any franchise. Every color is a theme variable of `under-the-sea`, so the whole
 * drawing re-colours with its palette; tints are `opacity` on a theme color and nothing else.
 */

const h = createElement;

const SCENE_WIDTH = 390;
const SCENE_HEIGHT = 200;
const DIVIDER_HEIGHT = 56;
const FOOTER_HEIGHT = 62;

/** One placed stamp of a reusable shape: where it sits, how far it turns, how big it is. */
interface Place {
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
  readonly scale: number;
}

/** The two bands of the surface, and the three shafts of light that fall through them. */
const WAVE_FAR =
  "M-8 10C10 4 26 16 46 10C66 4 82 16 102 10C122 4 138 16 158 10C178 4 194 16 214 10C234 4 250 16 270 " +
  "10C290 4 306 16 326 10C346 4 362 16 382 10C390 7 394 9 396 10V22H-8Z";

const WAVE_NEAR =
  "M-8 22C14 14 30 28 52 22C74 16 90 28 112 22C134 16 150 28 172 22C194 16 210 28 232 22C254 16 270 28 " +
  "292 22C314 16 330 28 352 22C370 17 382 22 396 21V34H-8Z";

/** One kelp plant: a wavy stem with four leaves cut from the same sheet. */
const KELP =
  "M0 0C-3-9 3-14 1-22C-1-30 4-34 2-44C0-52 4-56 3-62C6-56 7-50 6-44C9-36 5-30 7-22C8-14 4-8 5 0Z" +
  "M1-24C-8-28-11-36-9-42C-4-38-1-30 1-24Z" +
  "M3-40C12-44 16-52 14-58C9-54 4-46 3-40Z" +
  "M2-11C-7-13-10-19-9-25C-4-21-1-17 2-11Z";

/** A branching coral: one stem that forks three times, with a lighter ridge cut into it. */
const CORAL_BRANCH =
  "M-8 0C-8-10-6-14-10-20C-6-18-2-14 0-8C2-16 4-24 2-32C8-26 8-16 8-8C10-16 12-24 18-30C16-22 14-14 14 0Z";

/** The ridge of the branching coral, and the three folds of the brain coral. */
const CORAL_RIDGE = "M-6-6C-8-12-7-16-9-19M4-8C5-16 4-22 2-27M11-8C12-14 13-20 16-25";
const BRAIN_FOLDS = "M-14-6C-8-11-2-6 5-11M-12-14C-5-19 1-14 8-18M-6-20C0-23 6-21 10-17";

/** A sea fan: the webbed hand of a gorgonian, with its ribs. */
const SEA_FAN = "M0 0C-15-6-21-19-18-32C-12-25-6-20 0-18C6-20 12-25 18-32C21-19 15-6 0 0Z";

/** The turtle: the domed shell, its plated lines, the head, the four flippers and the little tail. */
const TURTLE_SHELL = "M-26 2C-26-11-14-20 0-20C14-20 26-11 26 2C26 6 14 9 0 9C-14 9-26 6-26 2Z";
const TURTLE_DOME = "M-22 0C-20-10-11-16 0-16C11-16 20-10 22 0Z";
const TURTLE_SCUTES =
  "M-11 4C-13-2-9-8-3-9M-3-9C-1-3-1 1 0 4M0 4C1 1 1-3 3-9M3-9C9-8 13-2 11 4M-26 2C-18-2 18-2 26 2";
const TURTLE_RIM = "M-25 3C-16 8 16 8 25 3C16 11-16 11-25 3Z";
const TURTLE_HEAD = "M25-3C32-8 41-5 41 2C41 8 32 9 25 4Z";
const TURTLE_FLIPPER_TOP = "M-4 4C-13 10-24 13-31 10C-24 5-14 4-6 2Z";
const TURTLE_FLIPPER_BOTTOM = "M14 6C17 15 13 22 6 22C6 15 9 11 11 6Z";
const TURTLE_EYE = "M35 1C35 0 36-0.6 37-0.4";

/** The large fish: body, rayed tail, dorsal and belly fins, and the pectoral fin. */
const FISH_BODY = "M-23 0C-17-12-4-17 8-15C17-13 21-6 23 0C21 6 17 13 8 15C-4 17-17 12-23 0Z";
const FISH_TAIL = "M22 0L39-13L34 0L39 13Z";
const FISH_TAIL_RAYS = "M24 0L35-9M24 0L35 9";
const FISH_DORSAL = "M-5-14L5-26L15-13Z";
const FISH_BELLY_FIN = "M-7 13L1 22L11 12Z";
const FISH_PECTORAL = "M-2 6L4 17L11 8Z";

/** The small fish of the school: a body, a tail and a dot of an eye. */
const SCHOOL_FISH = "M-8 0C-5-5 0-7 4-6C7-5 8-2 8 0C8 2 7 5 4 6C0 7-5 5-8 0ZM8 0L14-5L12 0L14 5Z";

/** The jellyfish: the scalloped bell, its inner ring, and the five ribbons that trail from it. */
const JELLY_BELL = "M-17 0C-17-13-9-21 0-21C9-21 17-13 17 0C9 5-9 5-17 0Z";
const JELLY_INNER = "M-11-1C-11-9-5-15 0-15C5-15 11-9 11-1C5 2-5 2-11-1Z";
const JELLY_RIBS = "M-8 0C-8-7-4-12 0-12C4-12 8-7 8 0";
const JELLY_TENTACLES =
  "M-10 2C-13 10-9 14-12 20C-14 25-11 28-12 32M-4 3C-6 12-3 16-5 22C-7 27-4 30-5 34" +
  "M3 3C5 12 2 16 4 22C6 27 3 30 4 34M9 2C12 10 8 14 11 20C13 25 10 28 11 32";

/** The treasure chest: the body, the open lid, the two bands, the lock and the coins that spill out. */
const CHEST_BODY = "M-17 0H17V-17H-17Z";
const CHEST_LID = "M-19-17C-18-29-6-33 5-30L13-17Z";
const CHEST_BANDS = "M-8-17H-3V0H-8ZM5-17H10V0H5Z";
const CHEST_LOCK = "M-2-12H2V-7H-2Z";

/** A scallop shell: the fan, its ribs and the hinge, and the spiral shell beside it. */
const SHELL = "M0 0C0-9 7-16 15-16C23-16 30-9 30 0C30 5 24 8 15 8C6 8 0 5 0 0Z";
const SHELL_RIBS = "M15 8V-16M8 6L5-14M22 6L25-14";

/** The sea star, and the pebbles the tide left on the sand. */
const STARFISH =
  "M0-13C3-8 5-6 8-6C13-6 16-4 13 0C10 3 8 5 9 10C10 14 6 15 3 12C1 10-1 10-3 12C-6 15-10 14-9 10C-8 5-10 " +
  "3-13 0C-16-4-13-6-8-6C-5-6-3-8 0-13Z";

/** A school of seven small fish, swimming the same way, each one smaller than the last. */
const SCHOOL: readonly Place[] = [
  { x: 58, y: 120, rotate: -6, scale: 0.95 },
  { x: 76, y: 108, rotate: -6, scale: 0.85 },
  { x: 94, y: 122, rotate: -4, scale: 0.8 },
  { x: 108, y: 100, rotate: -8, scale: 0.7 },
  { x: 122, y: 116, rotate: -2, scale: 0.6 },
  { x: 134, y: 104, rotate: -8, scale: 0.5 },
  { x: 100, y: 90, rotate: -10, scale: 0.45 },
];

/** The three depths of bubble: far, middle and near. Each one has its own ring and its own lit corner. */
function bubbleDefinition(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "bubble-definition" },
    h(
      "g",
      { id: id("bubble") },
      h("circle", {
        key: "ring",
        r: 5.6,
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1.5,
      }),
      h("circle", {
        key: "lit",
        cx: -1.9,
        cy: -2.2,
        r: 1.5,
        fill: "var(--inv-surface)",
        opacity: 0.9,
      }),
    ),
  );
}

/** The shell stamp, the starfish stamp, the small fish stamp, and the sparkle of the water. */
function stampDefinitions(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "stamp-definitions" },
    h(
      "g",
      { key: "shell", id: id("shell") },
      h("path", { key: "fan", d: SHELL }),
      h("path", {
        key: "ribs",
        d: SHELL_RIBS,
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1.1,
        opacity: 0.7,
      }),
    ),
    h(
      "g",
      { key: "starfish", id: id("starfish") },
      h("path", { key: "body", d: STARFISH }),
      h("path", {
        key: "arms",
        d: "M0-9V9M-8-3L8 3M6-3L-6 3",
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1,
        opacity: 0.5,
      }),
    ),
    h(
      "g",
      { key: "school-fish", id: id("school-fish") },
      h("path", { key: "body", d: SCHOOL_FISH }),
      h("circle", { key: "eye", cx: -3, cy: -1.4, r: 1.2, fill: "var(--inv-ink)", opacity: 0.7 }),
    ),
  );
}

/** One stamp, placed many times in one array: the keys are the array's own indexes. */
function stamps(
  key: string,
  id: IllustrationId,
  name: string,
  places: readonly Place[],
  paint: ThemePaint,
  opacity = 1,
): ReactElement {
  return h(
    "g",
    { key, fill: paint, opacity },
    places.map((item, index) =>
      h("use", {
        key: `${key}-${index}`,
        href: `#${id(name)}`,
        transform: `translate(${item.x} ${item.y}) rotate(${item.rotate}) scale(${item.scale})`,
      }),
    ),
  );
}

/** A kelp plant, standing on its own base, at a turn, a size and a mirror of its own. */
function kelp(
  id: IllustrationId,
  key: string,
  place: Place,
  paint: ThemePaint,
  opacity = 1,
): ReactElement {
  const mirror = place.scale < 0 ? ` scale(-1 1)` : "";

  return h("use", {
    key,
    href: `#${id("kelp")}`,
    fill: paint,
    opacity,
    transform: `translate(${place.x} ${place.y}) rotate(${place.rotate}) scale(${Math.abs(place.scale)})${mirror}`,
  });
}

/** The header diorama: water, light, the far reef, the school, the turtle, the fish and the chest. */
function scene(id: IllustrationId): ReactElement[] {
  const sheets: CutSheet[] = [];
  const body: ReactElement[] = [];
  const collect = (sheet: CutSheet): ReactElement[] => {
    sheets.push(sheet);
    return cutSheets(id, [sheet]);
  };

  const tear = tornEdge(SCENE_WIDTH, 6, 1.2, SCENE_HEIGHT + 8);
  const bank = tornEdge(SCENE_WIDTH, 172, 3.4, SCENE_HEIGHT + 8);

  body.push(
    ...collect({ name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false }),
    // Plane one: the depth of the water, four shafts of light, then the two bands of the surface.
    h("ellipse", {
      key: "depth",
      cx: 196,
      cy: 208,
      rx: 250,
      ry: 96,
      fill: "var(--inv-ink)",
      opacity: 0.1,
    }),
    h("ellipse", {
      key: "depth-deep",
      cx: 196,
      cy: 224,
      rx: 190,
      ry: 60,
      fill: "var(--inv-ink)",
      opacity: 0.1,
    }),
    h("path", {
      key: "ray-one",
      d: "M22 26L54 26L110 208H42Z",
      fill: "var(--inv-surface)",
      opacity: 0.26,
    }),
    h("path", {
      key: "ray-two",
      d: "M164 26L188 26L220 208H172Z",
      fill: "var(--inv-surface)",
      opacity: 0.18,
    }),
    h("path", {
      key: "ray-three",
      d: "M284 26L316 26L330 208H266Z",
      fill: "var(--inv-surface)",
      opacity: 0.22,
    }),
    ...collect({ name: "wave-far", d: WAVE_FAR, fill: "var(--inv-surface)", shadow: false }),
    ...collect({
      name: "wave-near",
      d: WAVE_NEAR,
      fill: "var(--inv-decoration-two)",
      shadow: false,
    }),
    h("path", {
      key: "wave-highlight",
      d: "M-8 24C20 16 36 30 62 24C88 18 104 30 130 24C156 18 172 30 198 24C224 18 240 30 266 24C292 18 308 30 334 24C356 19 376 26 398 23",
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 2,
      opacity: 0.75,
      strokeLinecap: "round",
    }),
    // The far reef ridge, and the faded kelp that grows behind the drawn one.
    h("path", {
      key: "reef-far",
      d: "M-8 174C18 166 32 148 56 150C80 152 92 164 116 162C140 160 150 142 174 144C198 146 210 160 234 158C258 156 268 140 292 142C316 144 328 158 352 156C372 154 384 164 398 160V208H-8Z",
      fill: "var(--inv-accent)",
      opacity: 0.16,
    }),
    h("path", {
      key: "reef-mid",
      d: "M-8 186C24 180 44 168 72 172C100 176 112 188 142 186C172 184 188 170 218 172C248 174 262 186 292 184C322 182 338 168 368 172C382 174 390 180 398 178V208H-8Z",
      fill: "var(--inv-decoration-one)",
      opacity: 0.12,
    }),
    kelp(
      id,
      "kelp-far-left",
      { x: 70, y: 176, rotate: -4, scale: 0.9 },
      "var(--inv-decoration-two)",
      0.4,
    ),
    kelp(
      id,
      "kelp-far-right",
      { x: 330, y: 178, rotate: 6, scale: 0.8 },
      "var(--inv-decoration-two)",
      0.35,
    ),
    // Plane two: the jellyfish over the school, and the small fish crossing the open water.
    h(
      "g",
      { key: "jellyfish", transform: "translate(112 52)" },
      h("path", {
        key: "bell-shadow",
        d: JELLY_BELL,
        fill: "var(--inv-ink)",
        opacity: 0.14,
        transform: "translate(1.1 3.4)",
      }),
      h("path", { key: "bell", d: JELLY_BELL, fill: "var(--inv-decoration-two)" }),
      h("path", { key: "inner", d: JELLY_INNER, fill: "var(--inv-surface)", opacity: 0.45 }),
      h("path", {
        key: "ribs",
        d: JELLY_RIBS,
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1.1,
        opacity: 0.6,
      }),
      h("path", {
        key: "tentacles",
        d: JELLY_TENTACLES,
        fill: "none",
        stroke: "var(--inv-decoration-two)",
        strokeWidth: 2,
        opacity: 0.8,
        strokeLinecap: "round",
      }),
    ),
    stamps("school", id, "school-fish", SCHOOL, "var(--inv-decoration-two)", 0.95),
    stamps(
      "school-deep",
      id,
      "school-fish",
      [
        { x: 30, y: 96, rotate: 4, scale: 0.5 },
        { x: 44, y: 84, rotate: 2, scale: 0.4 },
      ],
      "var(--inv-accent)",
      0.45,
    ),
    // Plane two: the turtle, then the large fish with its rayed fins.
    h(
      "g",
      { key: "turtle", transform: "translate(268 76) rotate(-4)" },
      h("path", {
        key: "flipper-back",
        d: TURTLE_FLIPPER_BOTTOM,
        fill: "var(--inv-soft)",
      }),
      h("path", {
        key: "tail",
        d: "M-27 1C-33 3-37 1-39-3C-35-3-30-1-27-1Z",
        fill: "var(--inv-soft)",
      }),
      h("path", {
        key: "shell-shadow",
        d: TURTLE_SHELL,
        fill: "var(--inv-ink)",
        opacity: 0.16,
        transform: "translate(1.1 3.4)",
      }),
      h("path", { key: "shell", d: TURTLE_SHELL, fill: "var(--inv-accent)" }),
      h("path", { key: "dome", d: TURTLE_DOME, fill: "var(--inv-surface)", opacity: 0.22 }),
      h("path", {
        key: "scutes",
        d: TURTLE_SCUTES,
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1.3,
        opacity: 0.6,
      }),
      h("path", { key: "rim", d: TURTLE_RIM, fill: "var(--inv-soft)" }),
      h("path", { key: "flipper-top", d: TURTLE_FLIPPER_TOP, fill: "var(--inv-soft)" }),
      h("path", { key: "head", d: TURTLE_HEAD, fill: "var(--inv-soft)" }),
      h("path", {
        key: "eye",
        d: TURTLE_EYE,
        fill: "none",
        stroke: "var(--inv-ink)",
        strokeWidth: 1.6,
        strokeLinecap: "round",
        opacity: 0.8,
      }),
    ),
    h(
      "g",
      { key: "fish-big", transform: "translate(158 104) rotate(-3)" },
      h("path", { key: "tail", d: FISH_TAIL, fill: "var(--inv-decoration-two)" }),
      h("path", {
        key: "tail-rays",
        d: FISH_TAIL_RAYS,
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1,
        opacity: 0.6,
      }),
      h("path", { key: "dorsal", d: FISH_DORSAL, fill: "var(--inv-decoration-two)" }),
      h("path", { key: "belly-fin", d: FISH_BELLY_FIN, fill: "var(--inv-decoration-two)" }),
      h("path", {
        key: "body-shadow",
        d: FISH_BODY,
        fill: "var(--inv-ink)",
        opacity: 0.16,
        transform: "translate(1.1 3.4)",
      }),
      h("path", { key: "body", d: FISH_BODY, fill: "var(--inv-decoration-one)" }),
      h("path", { key: "pectoral", d: FISH_PECTORAL, fill: "var(--inv-decoration-two)" }),
      h("path", {
        key: "fin-light",
        d: "M-2-3L5-9L11-2Z",
        fill: "var(--inv-surface)",
        opacity: 0.25,
      }),
      h("circle", { key: "eye", cx: -13, cy: -3, r: 3.4, fill: "var(--inv-surface)" }),
      h("circle", { key: "pupil", cx: -14, cy: -3, r: 1.6, fill: "var(--inv-ink)" }),
      h(
        "g",
        { key: "spots", fill: "var(--inv-surface)", opacity: 0.55 },
        [
          { x: 2, y: -6 },
          { x: 10, y: 2 },
          { x: 0, y: 6 },
          { x: 12, y: -6 },
        ].map((spot, index) =>
          h("circle", { key: `spot-${index}`, cx: spot.x, cy: spot.y, r: 1.6 }),
        ),
      ),
    ),
    // Plane three: the sand, its ripples and the chest that the tide left open.
    ...collect({ name: "sand", d: bank.sheet, fill: "var(--inv-surface)" }),
    h("path", {
      key: "ripples",
      d:
        "M-8 182C30 178 62 186 100 182C138 178 170 186 208 182C246 178 278 186 316 182C346 179 372 184 398 181" +
        "M-8 190C34 186 66 194 104 190C142 186 174 194 212 190C250 186 282 194 320 190C350 187 374 192 398 189" +
        "M-8 197C30 194 60 200 96 197C132 194 166 200 202 197C238 194 270 200 306 197C338 194 370 199 398 196",
      fill: "none",
      stroke: "var(--inv-soft)",
      strokeWidth: 1.8,
      opacity: 0.9,
      strokeLinecap: "round",
    }),
    h("path", {
      key: "pebbles",
      d:
        "M40 186C43 184 47 185 48 187C49 189 46 191 43 190C40 189 39 187 40 186Z" +
        "M120 192C124 190 129 191 130 193C131 195 127 197 123 196C120 195 119 193 120 192Z" +
        "M262 188C266 186 271 187 272 189C273 191 269 193 265 192C262 191 261 189 262 188Z",
      fill: "var(--inv-soft)",
      opacity: 0.9,
    }),
    h(
      "g",
      { key: "chest", transform: "translate(288 158)" },
      h("path", {
        key: "chest-shadow",
        d: CHEST_BODY,
        fill: "var(--inv-ink)",
        opacity: 0.16,
        transform: "translate(1.1 3.4)",
      }),
      h("path", { key: "body", d: CHEST_BODY, fill: "var(--inv-decoration-one)" }),
      h("path", { key: "lid", d: CHEST_LID, fill: "var(--inv-decoration-two)" }),
      h("path", { key: "bands", d: CHEST_BANDS, fill: "var(--inv-surface)", opacity: 0.75 }),
      h("path", { key: "lock", d: CHEST_LOCK, fill: "var(--inv-surface)" }),
      h("circle", { key: "coin-one", cx: -6, cy: -2, r: 2.6, fill: "var(--inv-surface)" }),
      h("circle", { key: "coin-two", cx: -1, cy: -1, r: 2.2, fill: "var(--inv-decoration-two)" }),
      h("circle", { key: "coin-three", cx: 4, cy: -2, r: 2.4, fill: "var(--inv-surface)" }),
    ),
    // The corals, the shells and the stars on the sand.
    h(
      "g",
      { key: "coral-left", transform: "translate(40 178) scale(1.1)" },
      h("path", {
        key: "shadow",
        d: CORAL_BRANCH,
        fill: "var(--inv-ink)",
        opacity: 0.14,
        transform: "translate(1.1 3.4)",
      }),
      h("path", { key: "branch", d: CORAL_BRANCH, fill: "var(--inv-decoration-two)" }),
      h("path", {
        key: "ridge",
        d: CORAL_RIDGE,
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1.2,
        opacity: 0.45,
      }),
    ),
    h(
      "g",
      { key: "coral-right", transform: "translate(360 176) scale(0.95)" },
      h("path", { key: "branch", d: CORAL_BRANCH, fill: "var(--inv-decoration-two)" }),
      h("path", {
        key: "ridge",
        d: CORAL_RIDGE,
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1.1,
        opacity: 0.4,
      }),
    ),
    h(
      "g",
      { key: "brain-coral", transform: "translate(196 180)" },
      h("path", {
        key: "dome",
        d: "M-18 0C-18-14-8-22 0-22C8-22 18-14 18 0Z",
        fill: "var(--inv-accent)",
      }),
      h("path", {
        key: "folds",
        d: BRAIN_FOLDS,
        fill: "none",
        stroke: "var(--inv-soft)",
        strokeWidth: 1.6,
        opacity: 0.75,
        strokeLinecap: "round",
      }),
    ),
    h(
      "g",
      { key: "sea-fan", transform: "translate(86 176) scale(0.85)" },
      h("path", { key: "web", d: SEA_FAN, fill: "var(--inv-decoration-one)" }),
      h("path", {
        key: "ribs",
        d: "M0-1V-29M0-8L-9-22M0-8L9-22M0-18L-13-30M0-18L13-30",
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1,
        opacity: 0.5,
      }),
    ),
    h("use", {
      key: "shell-sand",
      href: `#${id("shell")}`,
      fill: "var(--inv-decoration-two)",
      transform: "translate(150 186) rotate(-5) scale(0.9)",
    }),
    h("use", {
      key: "star-sand",
      href: `#${id("starfish")}`,
      fill: "var(--inv-decoration-one)",
      transform: "translate(250 188) rotate(8) scale(0.9)",
    }),
    h("use", {
      key: "star-sand-small",
      href: `#${id("starfish")}`,
      fill: "var(--inv-decoration-two)",
      transform: "translate(46 192) rotate(-10) scale(0.6)",
    }),
    // Plane four: the near water, with the bubbles of three depths and the kelp that frames the edges.
    stamps(
      "bubbles-far",
      id,
      "bubble",
      [
        { x: 200, y: 60, rotate: 0, scale: 0.5 },
        { x: 210, y: 46, rotate: 0, scale: 0.35 },
        { x: 96, y: 128, rotate: 0, scale: 0.45 },
        { x: 344, y: 92, rotate: 0, scale: 0.4 },
      ],
      "var(--inv-surface)",
      0.4,
    ),
    stamps(
      "bubbles-mid",
      id,
      "bubble",
      [
        { x: 276, y: 146, rotate: 0, scale: 0.9 },
        { x: 286, y: 128, rotate: 0, scale: 0.7 },
        { x: 278, y: 112, rotate: 0, scale: 0.55 },
        { x: 138, y: 78, rotate: 0, scale: 0.8 },
        { x: 150, y: 60, rotate: 0, scale: 0.6 },
      ],
      "var(--inv-surface)",
      0.85,
    ),
    kelp(id, "kelp-near-left", { x: 24, y: 182, rotate: -5, scale: 1.15 }, "var(--inv-accent)"),
    kelp(
      id,
      "kelp-near-left-small",
      { x: 46, y: 184, rotate: 8, scale: -0.75 },
      "var(--inv-accent)",
      0.9,
    ),
    kelp(id, "kelp-near-right", { x: 356, y: 186, rotate: 6, scale: 1.2 }, "var(--inv-accent)"),
    kelp(
      id,
      "kelp-mid-right",
      { x: 336, y: 182, rotate: -8, scale: -0.8 },
      "var(--inv-accent)",
      0.85,
    ),
    kelp(id, "kelp-mid", { x: 330, y: 180, rotate: -3, scale: 0.7 }, "var(--inv-accent)", 0.7),
    // The foreground: two fronds that the frame cuts, and a shell in the near sand.
    kelp(
      id,
      "kelp-foreground-left",
      { x: -2, y: 206, rotate: -12, scale: 1.7 },
      "var(--inv-accent)",
    ),
    kelp(
      id,
      "kelp-foreground-right",
      { x: 392, y: 208, rotate: 12, scale: -1.6 },
      "var(--inv-accent)",
    ),
    h("use", {
      key: "shell-foreground",
      href: `#${id("shell")}`,
      fill: "var(--inv-decoration-two)",
      transform: "translate(64 208) rotate(6) scale(1.5)",
    }),
    stamps(
      "bubbles-near",
      id,
      "bubble",
      [
        { x: 176, y: 168, rotate: 0, scale: 1.1 },
        { x: 186, y: 148, rotate: 0, scale: 0.8 },
        { x: 30, y: 150, rotate: 0, scale: 1 },
      ],
      "var(--inv-surface)",
      0.9,
    ),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  );

  return [
    sheetDefinitions(id, sheets),
    bubbleDefinition(id),
    stampDefinitions(id),
    h("defs", { key: "kelp-definition" }, h("path", { id: id("kelp"), d: KELP })),
    ...body,
  ];
}

/** The divider: the surface above, a jellyfish and a strait of the school, and the sand below. */
function divider(id: IllustrationId): ReactElement[] {
  const sheets: CutSheet[] = [];
  const body: ReactElement[] = [];
  const collect = (sheet: CutSheet): ReactElement[] => {
    sheets.push(sheet);
    return cutSheets(id, [sheet]);
  };

  const top = tornEdge(SCENE_WIDTH, 4, 2.6, DIVIDER_HEIGHT + 8);
  const bank = tornEdge(SCENE_WIDTH, 40, 4.8, DIVIDER_HEIGHT + 8);

  body.push(
    ...collect({ name: "strip", d: top.sheet, fill: "var(--inv-soft)", shadow: false }),
    // The surface, low enough to leave the water below it for the animals.
    h(
      "g",
      { key: "divider-surface", transform: "translate(0 -4) scale(1 0.8)" },
      h("use", { key: "wave", href: `#${id("wave")}`, fill: "var(--inv-decoration-two)" }),
      h("path", {
        key: "line",
        d: "M-8 24C20 16 36 30 62 24C88 18 104 30 130 24C156 18 172 30 198 24C224 18 240 30 266 24C292 18 308 30 334 24C356 19 376 26 398 23",
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 2,
        opacity: 0.8,
        strokeLinecap: "round",
      }),
    ),
    stamps(
      "divider-school",
      id,
      "school-fish",
      [
        { x: 150, y: 30, rotate: -4, scale: 0.85 },
        { x: 168, y: 23, rotate: -6, scale: 0.7 },
        { x: 184, y: 32, rotate: -2, scale: 0.55 },
      ],
      "var(--inv-decoration-two)",
      0.95,
    ),
    ...collect({ name: "sand", d: bank.sheet, fill: "var(--inv-surface)" }),
    h("path", {
      key: "divider-ripple",
      d:
        "M-8 49C34 45 66 53 104 49C142 45 174 53 212 49C250 45 282 53 320 49C350 46 374 51 398 48" +
        "M-8 55C30 52 60 58 96 55C132 52 166 58 202 55C238 52 270 58 306 55C338 52 370 57 398 54",
      fill: "none",
      stroke: "var(--inv-soft)",
      strokeWidth: 1.8,
      opacity: 0.9,
      strokeLinecap: "round",
    }),
    // The jellyfish floats in front of the sand, its ribbons trailing over it.
    h(
      "g",
      { key: "divider-jelly", transform: "translate(86 40) scale(0.72)" },
      h("path", {
        key: "bell-shadow",
        d: JELLY_BELL,
        fill: "var(--inv-ink)",
        opacity: 0.12,
        transform: "translate(1.1 3.4)",
      }),
      h("path", { key: "bell", d: JELLY_BELL, fill: "var(--inv-decoration-one)" }),
      h("path", { key: "inner", d: JELLY_INNER, fill: "var(--inv-surface)", opacity: 0.5 }),
      h("path", {
        key: "tentacles",
        d: JELLY_TENTACLES,
        fill: "none",
        stroke: "var(--inv-decoration-one)",
        strokeWidth: 2,
        opacity: 0.85,
        strokeLinecap: "round",
      }),
    ),
    h(
      "g",
      { key: "divider-coral", transform: "translate(330 54) scale(0.7)" },
      h("path", { key: "branch", d: CORAL_BRANCH, fill: "var(--inv-decoration-two)" }),
      h("path", {
        key: "ridge",
        d: CORAL_RIDGE,
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1.2,
        opacity: 0.45,
      }),
    ),
    h("use", {
      key: "divider-shell",
      href: `#${id("shell")}`,
      fill: "var(--inv-decoration-two)",
      transform: "translate(206 52) rotate(-6) scale(0.7)",
    }),
    h("use", {
      key: "divider-star",
      href: `#${id("starfish")}`,
      fill: "var(--inv-decoration-one)",
      transform: "translate(272 50) rotate(6) scale(0.65)",
    }),
    kelp(id, "divider-kelp-left", { x: 20, y: 56, rotate: -6, scale: 0.7 }, "var(--inv-accent)"),
    kelp(id, "divider-kelp-right", { x: 372, y: 58, rotate: 8, scale: -0.7 }, "var(--inv-accent)"),
    stamps(
      "divider-bubbles",
      id,
      "bubble",
      [
        { x: 240, y: 24, rotate: 0, scale: 0.7 },
        { x: 252, y: 12, rotate: 0, scale: 0.5 },
        { x: 120, y: 20, rotate: 0, scale: 0.45 },
      ],
      "var(--inv-surface)",
      0.9,
    ),
  );

  return [
    sheetDefinitions(id, sheets),
    bubbleDefinition(id),
    stampDefinitions(id),
    h("defs", { key: "wave-definition" }, h("path", { id: id("wave"), d: WAVE_NEAR })),
    h("defs", { key: "kelp-definition" }, h("path", { id: id("kelp"), d: KELP })),
    ...body,
  ];
}

/** The footer: the sand with its ripples, a shell, a star, corals and the tips of the kelp. */
function footer(id: IllustrationId): ReactElement[] {
  const sheets: CutSheet[] = [];
  const body: ReactElement[] = [];
  const collect = (sheet: CutSheet): ReactElement[] => {
    sheets.push(sheet);
    return cutSheets(id, [sheet]);
  };

  const top = tornEdge(SCENE_WIDTH, 6, 6.2, FOOTER_HEIGHT + 8);
  const bank = tornEdge(SCENE_WIDTH, 26, 2.2, FOOTER_HEIGHT + 8);

  body.push(
    ...collect({ name: "strip", d: top.sheet, fill: "var(--inv-soft)", shadow: false }),
    stamps(
      "footer-bubbles",
      id,
      "bubble",
      [
        { x: 60, y: 16, rotate: 0, scale: 0.6 },
        { x: 74, y: 8, rotate: 0, scale: 0.4 },
        { x: 320, y: 12, rotate: 0, scale: 0.55 },
      ],
      "var(--inv-surface)",
      0.85,
    ),
    kelp(id, "footer-kelp-left", { x: 22, y: 56, rotate: -4, scale: 0.8 }, "var(--inv-accent)"),
    kelp(id, "footer-kelp-mid", { x: 44, y: 58, rotate: 6, scale: -0.6 }, "var(--inv-accent)", 0.8),
    kelp(id, "footer-kelp-right", { x: 368, y: 58, rotate: 6, scale: -0.85 }, "var(--inv-accent)"),
    ...collect({ name: "sand", d: bank.sheet, fill: "var(--inv-surface)" }),
    h("path", {
      key: "footer-ripples",
      d:
        "M-8 36C30 32 62 40 100 36C138 32 170 40 208 36C246 32 278 40 316 36C346 33 372 38 398 35" +
        "M-8 46C34 42 66 50 104 46C142 42 174 50 212 46C250 42 282 50 320 46C350 43 374 48 398 45" +
        "M-8 55C30 52 60 58 96 55C132 52 166 58 202 55C238 52 270 58 306 55C338 52 370 57 398 54",
      fill: "none",
      stroke: "var(--inv-soft)",
      strokeWidth: 1.8,
      opacity: 0.9,
      strokeLinecap: "round",
    }),
    h(
      "g",
      { key: "footer-coral", transform: "translate(116 58) scale(0.85)" },
      h("path", { key: "branch", d: CORAL_BRANCH, fill: "var(--inv-decoration-two)" }),
      h("path", {
        key: "ridge",
        d: CORAL_RIDGE,
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1.2,
        opacity: 0.4,
      }),
    ),
    h(
      "g",
      { key: "footer-brain", transform: "translate(252 58) scale(0.8)" },
      h("path", {
        key: "dome",
        d: "M-18 0C-18-14-8-22 0-22C8-22 18-14 18 0Z",
        fill: "var(--inv-accent)",
      }),
      h("path", {
        key: "folds",
        d: BRAIN_FOLDS,
        fill: "none",
        stroke: "var(--inv-soft)",
        strokeWidth: 1.6,
        opacity: 0.75,
        strokeLinecap: "round",
      }),
    ),
    h("use", {
      key: "footer-shell",
      href: `#${id("shell")}`,
      fill: "var(--inv-decoration-two)",
      transform: "translate(168 54) rotate(-4) scale(0.85)",
    }),
    h("use", {
      key: "footer-star",
      href: `#${id("starfish")}`,
      fill: "var(--inv-decoration-one)",
      transform: "translate(210 54) rotate(10) scale(0.8)",
    }),
    h("use", {
      key: "footer-shell-small",
      href: `#${id("shell")}`,
      fill: "var(--inv-accent)",
      transform: "translate(300 56) rotate(8) scale(0.6)",
    }),
    h("path", {
      key: "footer-pebbles",
      d:
        "M88 54C91 52 95 53 96 55C97 57 94 59 91 58C88 57 87 55 88 54Z" +
        "M330 58C334 56 339 57 340 59C341 61 337 63 333 62C330 61 329 59 330 58Z",
      fill: "var(--inv-soft)",
      opacity: 0.9,
    }),
  );

  return [
    sheetDefinitions(id, sheets),
    bubbleDefinition(id),
    stampDefinitions(id),
    h("defs", { key: "kelp-definition" }, h("path", { id: id("kelp"), d: KELP })),
    ...body,
  ];
}

/** «Bajo el mar» in paper cut-out: the reef diorama, the surface divider, and the sand footer. */
export const UNDER_THE_SEA_ILLUSTRATION: ThemeIllustration = {
  theme: "under-the-sea",
  scene: {
    viewBox: `0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`,
    preserveAspectRatio: "xMidYMid slice",
    draw: scene,
  },
  divider: {
    viewBox: `0 0 ${SCENE_WIDTH} ${DIVIDER_HEIGHT}`,
    preserveAspectRatio: "xMidYMid meet",
    draw: divider,
  },
  footer: {
    viewBox: `0 0 ${SCENE_WIDTH} ${FOOTER_HEIGHT}`,
    preserveAspectRatio: "xMidYMid meet",
    draw: footer,
  },
};
