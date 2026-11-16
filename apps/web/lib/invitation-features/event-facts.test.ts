import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  babyShowerEventFacts,
  baptismArchEventFacts,
  baptismEventFacts,
  birthdayMapEventFacts,
  birthdayPosterEventFacts,
  birthdayStoryEventFacts,
  EVENT_FACTS,
  eventFactsFor,
  weddingArchEventFacts,
  xvArchEventFacts,
} from "./event-facts.ts";

// The event facts of a layout (S4): the celebration title, when it starts, and the places a guest can be
// sent to. Each layout reads them from its own parsed content through a pure function, and the allow-listed
// map is the only place a `componentKey` becomes one of those functions, so no catalog name selects code.

const BIRTHDAY = {
  celebrantName: "Mateo",
  age: 7,
  date: "2026-12-05",
  time: "16:30",
  location: "Jardín Los Arcos",
  address: "Av. de las Flores 214, Ciudad de México",
  mainPhoto: "https://example.com/mateo.svg",
  message: "¡Ven a celebrar conmigo!",
};

const BABY_SHOWER = {
  hosts: "Mariana y Lucía Ruiz",
  date: "2027-03-13",
  time: "12:00",
  location: "Jardín Las Palmas",
  address: "Av. de los Cedros 88, Ciudad de México",
  message: "¡Te esperamos para celebrar!",
  rsvpContact: "Confirma con Mariana al 55 1234 5678",
};

const BAPTISM = {
  celebrantName: "Emilia",
  date: "2027-04-11",
  parents: "Diego y Valentina Ortiz",
  godparents: "Andrés Ortiz y Camila Reyes",
  ceremonyPlace: "Parroquia San Miguel",
  ceremonyAddress: "Calle Hidalgo 45, Centro, Querétaro",
  ceremonyTime: "11:00",
  receptionPlace: "Casa de los abuelos",
  receptionAddress: "Av. de los Fresnos 210, Querétaro",
  receptionTime: "13:30",
  message: "Acompáñanos a dar la bienvenida a Emilia.",
  rsvpContact: "Confirma con Valentina al 55 9876 5432",
};

const XV = {
  celebrantName: "Valentina Ramírez",
  date: "2026-08-15",
  parents: "Miguel Ramírez Alcántara\nAdriana Solís de Ramírez",
  honorSponsors: "Joaquín Esquivel del Valle\nMariana Robles de Esquivel",
  ceremonyPlace: "Parroquia de San Agustín",
  ceremonyAddress: "Calle de los Fresnos 132, Ciudad de México",
  ceremonyTime: "18:00",
  receptionPlace: "Jardín de los Olivos",
  receptionAddress: "Camino Real a Santa Fe 41, Ciudad de México",
  receptionTime: "20:30",
  dressCode: "Formal · etiqueta",
  message: "Hay días que se esperan toda una vida.",
  rsvpContact: "Adriana Solís · 55 8120 4471",
};

const WEDDING = {
  coupleNameOne: "Ana Sofía",
  coupleNameTwo: "Daniel",
  date: "2026-09-12",
  ceremonyPlace: "Parroquia de Santa Ana",
  ceremonyAddress: "Av. Juárez 120, Centro, Querétaro",
  ceremonyTime: "17:00",
  receptionPlace: "Hacienda San Gabriel",
  receptionAddress: "Camino a la Hacienda 8, Querétaro",
  receptionTime: "19:30",
  dressCode: "Formal",
  message: "Nos encantaría celebrar contigo.",
  rsvpContact: "Confirma con Ana Sofía al 55 1234 5678",
};

describe("event facts per layout", () => {
  it("reads the three birthday layouts from the one content shape they share", () => {
    const facts = birthdayMapEventFacts(BIRTHDAY);

    assert.deepEqual(facts, {
      title: "Cumpleaños de Mateo",
      date: "2026-12-05",
      time: "16:30",
      places: [
        {
          label: "Lugar",
          name: "Jardín Los Arcos",
          address: "Av. de las Flores 214, Ciudad de México",
        },
      ],
    });
    assert.deepEqual(birthdayPosterEventFacts(BIRTHDAY), facts);
    assert.deepEqual(birthdayStoryEventFacts(BIRTHDAY), facts);
  });

  it("names the baby shower after the baby, or after the hosts when the name is a surprise", () => {
    assert.equal(babyShowerEventFacts(BABY_SHOWER).title, "Baby shower de Mariana y Lucía Ruiz");
    assert.equal(
      babyShowerEventFacts({ ...BABY_SHOWER, babyName: "Sofía" }).title,
      "Baby shower de Sofía",
    );
    assert.deepEqual(babyShowerEventFacts(BABY_SHOWER), {
      title: "Baby shower de Mariana y Lucía Ruiz",
      date: "2027-03-13",
      time: "12:00",
      places: [
        {
          label: "Lugar",
          name: "Jardín Las Palmas",
          address: "Av. de los Cedros 88, Ciudad de México",
        },
      ],
    });
  });

  it("gives a baptism both its ceremony and its reception, starting at the ceremony", () => {
    assert.deepEqual(baptismEventFacts(BAPTISM), {
      title: "Bautizo de Emilia",
      date: "2027-04-11",
      time: "11:00",
      places: [
        {
          label: "Ceremonia",
          name: "Parroquia San Miguel",
          address: "Calle Hidalgo 45, Centro, Querétaro",
        },
        {
          label: "Recepción",
          name: "Casa de los abuelos",
          address: "Av. de los Fresnos 210, Querétaro",
        },
      ],
    });
  });

  it("names an XV after the celebrant and a wedding after the couple", () => {
    assert.deepEqual(xvArchEventFacts(XV), {
      title: "XV años de Valentina Ramírez",
      date: "2026-08-15",
      time: "18:00",
      places: [
        {
          label: "Ceremonia",
          name: "Parroquia de San Agustín",
          address: "Calle de los Fresnos 132, Ciudad de México",
        },
        {
          label: "Recepción",
          name: "Jardín de los Olivos",
          address: "Camino Real a Santa Fe 41, Ciudad de México",
        },
      ],
    });
    assert.deepEqual(weddingArchEventFacts(WEDDING), {
      title: "Boda de Ana Sofía y Daniel",
      date: "2026-09-12",
      time: "17:00",
      places: [
        {
          label: "Ceremonia",
          name: "Parroquia de Santa Ana",
          address: "Av. Juárez 120, Centro, Querétaro",
        },
        {
          label: "Recepción",
          name: "Hacienda San Gabriel",
          address: "Camino a la Hacienda 8, Querétaro",
        },
      ],
    });
  });

  it("gives the formal baptism the same facts as the themed one", () => {
    assert.deepEqual(baptismArchEventFacts(BAPTISM), baptismEventFacts(BAPTISM));
  });

  it("is pure: the same content answers the same facts and stays unchanged", () => {
    const content = structuredClone(BAPTISM);
    const first = baptismEventFacts(content);

    assert.deepEqual(baptismEventFacts(content), first);
    assert.notEqual(baptismEventFacts(content), first);
    assert.deepEqual(content, BAPTISM);
  });

  it("is keyed by an allow-listed component key and answers nothing for any other key", () => {
    assert.deepEqual(
      [...EVENT_FACTS.keys()],
      [
        "birthday-map-01",
        "birthday-poster-01",
        "birthday-story-01",
        "baby-shower-classic-01",
        "baptism-classic-01",
        "xv-arch-01",
        "wedding-arch-01",
        "baptism-arch-01",
      ],
    );
    assert.deepEqual(eventFactsFor("birthday-map-01", BIRTHDAY), birthdayMapEventFacts(BIRTHDAY));
    assert.deepEqual(eventFactsFor("baptism-classic-01", BAPTISM), baptismEventFacts(BAPTISM));
    assert.deepEqual(eventFactsFor("xv-arch-01", XV), xvArchEventFacts(XV));
    assert.deepEqual(eventFactsFor("wedding-arch-01", WEDDING), weddingArchEventFacts(WEDDING));
    assert.deepEqual(eventFactsFor("baptism-arch-01", BAPTISM), baptismArchEventFacts(BAPTISM));
    assert.equal(eventFactsFor("formal-classic-01", BAPTISM), undefined);
    assert.equal(eventFactsFor("__proto__", BAPTISM), undefined);
    assert.equal(eventFactsFor("constructor", BAPTISM), undefined);
    assert.equal(eventFactsFor("toString", BAPTISM), undefined);
  });

  it("refuses content its own layout cannot render, naming the layout", () => {
    assert.throws(() => baptismEventFacts({ ...BAPTISM, ceremonyTime: "25:00" }), {
      name: "RendererPropsError",
      message: /baptism-classic-01/,
    });
    assert.throws(() => birthdayMapEventFacts({ ...BIRTHDAY, age: 0 }), {
      name: "RendererPropsError",
      message: /birthday-map-01/,
    });
    assert.throws(() => xvArchEventFacts({ ...XV, ceremonyTime: "25:00" }), {
      name: "RendererPropsError",
      message: /xv-arch-01/,
    });
    assert.throws(() => weddingArchEventFacts({ ...WEDDING, coupleNameTwo: "" }), {
      name: "RendererPropsError",
      message: /wedding-arch-01/,
    });
  });
});
