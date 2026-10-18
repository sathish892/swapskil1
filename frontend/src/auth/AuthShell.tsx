import type { ReactNode } from "react";
import { Icon } from "../components/Icon";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-paper lg:grid lg:grid-cols-[0.9fr_1.1fr]">
      <aside className="relative hidden min-h-screen overflow-hidden bg-forest px-10 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-16 xl:py-12">
        <div aria-hidden="true" className="absolute -right-36 -top-32 size-[34rem] rounded-full border border-white/10" />
        <div aria-hidden="true" className="absolute -right-20 -top-16 size-[27rem] rounded-full border border-white/10" />
        <div aria-hidden="true" className="absolute -bottom-32 -left-24 size-96 rounded-full bg-lime/10 blur-3xl" />
        <a href="/" className="relative inline-flex w-fit items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime">
          <span className="grid size-10 place-items-center rounded-xl bg-lime text-forest"><Icon name="swap" className="size-5" /></span>
          <span className="font-display text-xl font-bold tracking-[-0.06em]">skill<span className="text-lime">swap</span></span>
        </a>
        <div className="relative my-16 max-w-xl">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.22em] text-lime">{eyebrow}</p>
          <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-[-0.055em] xl:text-5xl">{title}</h1>
          <p className="mt-5 max-w-md text-base leading-7 text-white/70">{description}</p>
          <div className="mt-12 flex gap-3" aria-hidden="true">
            <span className="grid size-12 place-items-center rounded-2xl bg-white/10 text-lime"><Icon name="bulb" className="size-6" /></span>
            <span className="grid size-12 place-items-center rounded-2xl bg-white/10 text-lime"><Icon name="swap" className="size-6" /></span>
            <span className="grid size-12 place-items-center rounded-2xl bg-white/10 text-lime"><Icon name="people" className="size-6" /></span>
          </div>
        </div>
        <p className="relative text-xs font-medium text-white/45">Share a skill. Grow together.</p>
      </aside>

      <section className="flex min-h-screen flex-col px-5 py-7 sm:px-8 lg:px-12 lg:py-10 xl:px-20">
        <a href="/" className="mb-8 inline-flex w-fit items-center gap-2 rounded-lg text-forest focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 lg:hidden">
          <span className="grid size-9 place-items-center rounded-xl bg-forest text-lime"><Icon name="swap" className="size-5" /></span>
          <span className="font-display text-lg font-bold tracking-[-0.06em]">skill<span className="text-emerald-800">swap</span></span>
        </a>
        <div className="my-auto w-full max-w-md self-center py-6">
          <div className="mb-8">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-emerald-800">{eyebrow}</p>
            <h2 className="font-display text-3xl font-semibold tracking-[-0.05em] text-ink sm:text-4xl">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">{description}</p>
          </div>
          {children}
        </div>
        <p className="pt-8 text-center text-xs leading-5 text-slate-500">A place to learn from one another, one skill at a time.</p>
      </section>
    </main>
  );
}
