import { LANDING_COPY, type SampleCard } from "../../../lib/landing/copy.ts";
import { Art, pick } from "./art.tsx";
import styles from "./landing.module.css";

/*
 * Sample stationery of the landing (M2 T8l; S35, S37): illustrations of invitations that do not exist
 * yet. Each one sits inside an element that is labeled as a sample or hidden from assistive
 * technology, so its printed names and dates are never read as real content.
 */

const { hero } = LANDING_COPY;

function Kicker({ card }: { card: SampleCard }) {
  return card.kicker ? <span className={styles.kicker}>{card.kicker}</span> : null;
}

function Seal({ monogram }: { monogram: string }) {
  return (
    <span className={styles.seal}>
      <span className={styles.monogram}>{monogram}</span>
    </span>
  );
}

/** The hero illustration: invitations fanned out of the envelope, the phone, and the bouquets. */
export function HeroStationery() {
  const { xv, wedding, birthday, phone } = hero;
  return (
    <>
      <span className={styles.arch} />
      <Art className={styles.rosesBack} eager name="bouquet" />
      <span className={styles.envelope}>
        <Art eager name="envelope" />
        <Art className={styles.envelopeSpray} eager name="envelopeSpray" />
        <Seal monogram={hero.monogram} />
      </span>

      <span className={`${styles.card} ${styles.cardXv} ${styles.scalloped}`}>
        <span className={styles.cardBody}>
          <span className={styles.foilFrame} />
          <Art className={`${styles.corner} ${styles.cornerStart}`} eager name="cardCorner" />
          <Art className={`${styles.corner} ${styles.cornerEnd}`} eager name="cardCorner" />
          <Art className={styles.crown} eager name="crown" />
          <Kicker card={xv} />
          <span className={styles.name}>{xv.name}</span>
          <span className={styles.rule} />
          <span className={styles.date}>{xv.date}</span>
        </span>
      </span>

      <span className={`${styles.card} ${styles.cardBirthday} ${styles.scalloped}`}>
        <span className={styles.cardBody}>
          <span className={`${styles.foilFrame} ${styles.foilFrameLeaf}`} />
          <Art className={styles.bunting} eager name="bunting" />
          <Art className={styles.balloons} eager name="balloons" />
          <span className={styles.name}>{birthday.name}</span>
          <span className={styles.age}>
            {birthday.turns} <b>{birthday.age}</b>
          </span>
          <span className={styles.rule} />
          <span className={styles.date}>{birthday.date}</span>
        </span>
      </span>

      <span className={`${styles.card} ${styles.cardWedding}`}>
        <span className={styles.cardBody}>
          <span className={styles.archFrame} />
          <Art className={styles.garland} eager name="garland" />
          <Kicker card={wedding} />
          <span className={styles.name}>{wedding.name}</span>
          <span className={styles.rule} />
          <span className={styles.when}>{wedding.date}</span>
        </span>
      </span>

      <span className={styles.phone}>
        <span className={styles.screen}>
          <span className={styles.island} />
          <span className={styles.cover}>
            <Art eager name="garland" />
            <span className={styles.name}>{phone.name}</span>
          </span>
          <span className={styles.kicker}>{phone.kicker}</span>
          <span className={styles.date}>{phone.date}</span>
          <span className={styles.countLabel}>{phone.countdownLabel}</span>
          <span className={styles.count}>
            {phone.countdown.map(({ value, unit }) => (
              <span key={unit}>
                {value}
                <small>{unit}</small>
              </span>
            ))}
          </span>
          <span className={styles.reply}>{phone.reply}</span>
        </span>
      </span>
    </>
  );
}

type Design = (typeof LANDING_COPY.gallery.designs)[number];

/** The four sample designs of the gallery, in the order of `LANDING_COPY.gallery.designs`. */
const MINIS: readonly [typeof GardenMini, ...(typeof GardenMini)[]] = [
  GardenMini,
  XvMini,
  WineMini,
  PartyMini,
];
const TINTS: readonly [string | undefined, ...(string | undefined)[]] = [
  styles.tintGarden,
  styles.tintXv,
  styles.tintWine,
  styles.tintParty,
];

export function DesignThumbnail({ design, index }: { design: Design; index: number }) {
  const Mini = pick(MINIS, index);
  return (
    <span aria-hidden="true" className={`${styles.thumb} ${pick(TINTS, index)}`}>
      <Mini design={design} />
    </span>
  );
}

function GardenMini({ design }: { design: Design }) {
  const { sample } = design;
  return (
    <span className={`${styles.mini} ${styles.miniGarden}`}>
      <span className={styles.cardBody}>
        <span className={styles.foilFrame} />
        <Art className={styles.garland} name="garland" />
        <Kicker card={sample} />
        <span className={styles.name}>{sample.name}</span>
        <span className={styles.rule} />
        <span className={styles.when}>{sample.date}</span>
      </span>
    </span>
  );
}

function XvMini({ design }: { design: Design }) {
  const { sample } = design;
  return (
    <span className={`${styles.mini} ${styles.miniXv} ${styles.scalloped}`}>
      <span className={styles.cardBody}>
        <span className={styles.foilFrame} />
        <Art className={`${styles.corner} ${styles.cornerStart}`} name="cardCorner" />
        <Art className={`${styles.corner} ${styles.cornerEnd}`} name="cardCorner" />
        <Art className={styles.crown} name="crown" />
        <Kicker card={sample} />
        <span className={styles.name}>{sample.name}</span>
        <span className={styles.rule} />
        <span className={styles.date}>{sample.date}</span>
      </span>
    </span>
  );
}

function WineMini({ design }: { design: Design }) {
  const { sample } = design;
  return (
    <span className={`${styles.mini} ${styles.miniWine}`}>
      <span className={styles.cardBody}>
        <span className={styles.damask} />
        <Seal monogram={"monogram" in design ? design.monogram : ""} />
        <Kicker card={sample} />
        <span className={styles.name}>{sample.name}</span>
        <span className={styles.rule} />
        <span className={styles.when}>{sample.date}</span>
      </span>
    </span>
  );
}

function PartyMini({ design }: { design: Design }) {
  const { sample } = design;
  return (
    <span className={`${styles.mini} ${styles.miniParty} ${styles.scalloped}`}>
      <span className={styles.cardBody}>
        <span className={`${styles.foilFrame} ${styles.foilFrameLeaf}`} />
        <Art className={styles.bunting} name="bunting" />
        <Art className={styles.balloons} name="balloons" />
        <span className={styles.name}>{sample.name}</span>
        {"age" in design ? (
          <span className={styles.age}>
            {design.turns} <b>{design.age}</b>
          </span>
        ) : null}
        <span className={styles.rule} />
        <span className={styles.date}>{sample.date}</span>
      </span>
    </span>
  );
}
