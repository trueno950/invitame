import Link from "next/link";

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
    <main className="overflow-hidden bg-orange-50 text-slate-900">
      <section className="relative isolate px-6 pb-20 pt-6 sm:px-10 lg:px-16">
        <div className="absolute inset-x-0 top-0 -z-10 h-80 bg-amber-100" aria-hidden="true" />
        <nav className="mx-auto flex max-w-6xl items-center justify-between" aria-label="Principal">
          <span className="text-xl font-black tracking-tight text-orange-700">InvitaMe</span>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-800 sm:inline">
              Fundación inicial
            </span>
            <Link
              className="rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-950"
              href="/ingresar"
            >
              Ingresar
            </Link>
          </div>
        </nav>

        <div className="mx-auto grid max-w-6xl gap-12 pb-8 pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:pt-24">
          <div>
            <p className="mb-5 text-sm font-bold uppercase tracking-[0.2em] text-orange-700">
              Milestone 1
            </p>
            <h1 className="max-w-3xl text-5xl font-black tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
              Una base sólida para celebrar lo que importa.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-700 sm:text-xl">
              Estamos construyendo InvitaMe desde los cimientos: catálogo de plantillas versionadas,
              paquetes claros y una plataforma preparada para crecer con seguridad.
            </p>
            <a
              className="mt-9 inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-bold text-white transition hover:bg-slate-800 focus:outline-2 focus:outline-offset-4 focus:outline-slate-950"
              href="#progreso"
            >
              Conocer el progreso
              <span aria-hidden="true">→</span>
            </a>
          </div>

          <div className="relative mx-auto w-full max-w-md rounded-[2rem] border border-orange-200 bg-white p-6 shadow-xl shadow-orange-200/50 sm:p-8">
            <div className="rounded-3xl bg-slate-950 p-6 text-white">
              <p className="text-sm font-semibold text-orange-200">Próxima celebración</p>
              <p className="mt-8 text-3xl font-black">Aventura de cumpleaños</p>
              <div className="mt-8 rounded-2xl bg-white/10 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-orange-200">
                  Contrato estable
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  La información y la presentación avanzan con versiones claras, no con cambios
                  invisibles.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-3 text-sm text-slate-600">
              <span className="flex size-8 items-center justify-center rounded-full bg-orange-100 font-bold text-orange-700">
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
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-orange-700">
              Lo que ya existe
            </p>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Cimientos antes que promesas.
            </h2>
            <p className="mt-4 text-lg leading-8 text-slate-700">
              Esta etapa no simula un producto terminado. Deja listas las decisiones que permiten
              construirlo bien.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {FOUNDATIONS.map((foundation, index) => (
              <article
                className="rounded-3xl border border-orange-100 bg-white p-6"
                key={foundation.title}
              >
                <span className="text-sm font-black text-orange-700">0{index + 1}</span>
                <h3 className="mt-8 text-xl font-black text-slate-950">{foundation.title}</h3>
                <p className="mt-3 leading-7 text-slate-700">{foundation.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-orange-100 bg-white px-6 py-16 sm:px-10 lg:px-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-orange-700">
              Siguiente etapa
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
              Crear y enviar invitaciones llegará después.
            </h2>
          </div>
          <p className="max-w-md text-base leading-7 text-slate-700">
            Primero protegemos la base. Después construiremos cada experiencia sobre contratos que
            puedan durar.
          </p>
        </div>
      </section>
    </main>
  );
}
