import Link from "next/link";

import { Ornament } from "./_components/ornament.tsx";
import { focusRing } from "./_components/ui.ts";
import { Wordmark } from "./_components/wordmark.tsx";

const FOUNDATIONS = [
  {
    title: "Catálogo preparado",
    description: "Categorías, funciones y paquetes organizados para tomar decisiones con claridad.",
  },
  {
    title: "Plantillas versionadas",
    description:
      "Cada futuro diseño tendrá un contrato estable para que las celebraciones no cambien por sorpresa.",
  },
  {
    title: "Base técnica segura",
    description:
      "Una API con controles iniciales, conexión real a datos y espacio para crecer de forma responsable.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="overflow-hidden bg-background text-ink">
      <section className="relative isolate px-6 pb-20 pt-6 sm:px-10 lg:px-16">
        <div className="paper-wash absolute inset-x-0 top-0 -z-10 h-[36rem]" aria-hidden="true" />
        <nav className="mx-auto flex max-w-6xl items-center justify-between" aria-label="Principal">
          <Wordmark />
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full bg-surface/75 px-3 py-1 text-xs font-medium tracking-[0.04em] text-primary ring-1 ring-gold/55 sm:inline">
              Fundación inicial
            </span>
            <Link
              className={`rounded-full bg-primary px-5 py-2 text-sm font-medium tracking-[0.03em] text-on-primary shadow-button ring-1 ring-primary-deep transition-colors hover:bg-primary-deep ${focusRing}`}
              href="/ingresar"
            >
              Ingresar
            </Link>
          </div>
        </nav>

        <div className="mx-auto grid max-w-6xl gap-12 pb-8 pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:pt-24">
          <div>
            <p className="mb-5 inline-flex items-center gap-2.5 text-sm font-medium uppercase tracking-[0.2em] text-primary">
              <Ornament className="size-4.5" name="bud" />
              Milestone 1
            </p>
            <h1 className="max-w-3xl font-display text-5xl font-semibold leading-[1.05] text-ink sm:text-6xl lg:text-7xl">
              Una base sólida para celebrar lo que importa.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-muted sm:text-xl">
              Estamos construyendo InvitaMe desde los cimientos: catálogo de plantillas versionadas,
              paquetes claros y una plataforma preparada para crecer con seguridad.
            </p>
            <a
              className={`mt-9 inline-flex min-h-12 items-center gap-2 rounded-full bg-primary bg-linear-to-b from-primary from-55% to-primary-deep px-7 py-3 text-base font-medium tracking-[0.03em] text-on-primary shadow-button ring-1 ring-primary-deep transition-colors hover:from-primary-deep ${focusRing}`}
              href="#progreso"
            >
              Conocer el progreso
              <span aria-hidden="true">→</span>
            </a>
          </div>

          <div className="relative mx-auto w-full max-w-md rounded-card bg-surface p-6 shadow-paper ring-1 ring-gold/45 sm:p-8">
            <div className="rounded-panel bg-primary-deep p-6 text-on-primary">
              <p className="text-sm font-medium text-rose-100">Próxima celebración</p>
              <p className="mt-8 font-display text-4xl font-semibold">Aventura de cumpleaños</p>
              <div className="mt-8 rounded-field bg-surface/10 p-4 ring-1 ring-gold/40">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-rose-100">
                  Contrato estable
                </p>
                <p className="mt-2 text-sm leading-6 text-rose-50">
                  La información y la presentación avanzan con versiones claras, no con cambios
                  invisibles.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-3 text-sm text-muted">
              <span className="flex size-8 items-center justify-center rounded-full bg-rose-50 font-medium text-primary ring-1 ring-rose-100">
                01
              </span>
              Fundación técnica en curso
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 sm:px-10 lg:px-16" id="progreso">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2.5 text-sm font-medium uppercase tracking-[0.2em] text-primary">
              <Ornament className="size-4.5" name="bud" />
              Lo que ya existe
            </p>
            <h2 className="mt-4 font-display text-4xl font-semibold text-ink sm:text-5xl">
              Cimientos antes que promesas.
            </h2>
            <p className="mt-4 text-lg leading-8 text-muted">
              Esta etapa no simula un producto terminado. Deja listas las decisiones que permiten
              construirlo bien.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {FOUNDATIONS.map((foundation, index) => (
              <article
                className="rounded-card bg-surface p-6 shadow-soft ring-1 ring-rose-100"
                key={foundation.title}
              >
                <span className="font-display text-xl font-semibold text-primary">
                  0{index + 1}
                </span>
                <h3 className="mt-6 font-display text-2xl font-semibold text-ink">
                  {foundation.title}
                </h3>
                <p className="mt-3 leading-7 text-muted">{foundation.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-gold/40 bg-surface px-6 py-16 sm:px-10 lg:px-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="inline-flex items-center gap-2.5 text-sm font-medium uppercase tracking-[0.2em] text-primary">
              <Ornament className="size-4.5" name="bud" />
              Siguiente etapa
            </p>
            <h2 className="mt-3 font-display text-4xl font-semibold text-ink">
              Crear y enviar invitaciones llegará después.
            </h2>
          </div>
          <p className="max-w-md text-base leading-7 text-muted">
            Primero protegemos la base. Después construiremos cada experiencia sobre contratos que
            puedan durar.
          </p>
        </div>
      </section>
    </main>
  );
}
