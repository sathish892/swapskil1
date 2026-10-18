import { Navbar } from "./components/Navbar";
import { Icon } from "./components/Icon";
import type { PublicUser } from "./auth/types";

export function AboutPage({ user, onLogout, loggingOut }: { user: PublicUser | null; onLogout: () => void; loggingOut: boolean }) {
  return <div className="min-h-screen bg-paper text-ink">
    <Navbar user={user} onLogout={onLogout} loggingOut={loggingOut} onAccountAction={(action) => window.location.assign(action === "Log in" ? "/login" : "/register")} />
    <main>
      <section className="border-b border-ink/10 bg-white px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">About SkillSwap</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-tight tracking-[-0.05em] sm:text-5xl">A place to learn from each other.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">SkillSwap helps students connect around the skills they can share and the things they want to learn. An exchange starts with a conversation and grows through practice together.</p>
          <div className="mt-8 flex flex-wrap gap-3"><a href="/explore" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-forest px-5 text-sm font-semibold text-white transition hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-forest">Explore skills <Icon name="arrow-up-right" className="size-4" /></a><a href="/#how-it-works" className="inline-flex min-h-11 items-center rounded-lg border border-ink/15 px-5 text-sm font-semibold text-ink transition hover:bg-paper focus-visible:outline-2 focus-visible:outline-forest">How it works</a></div>
        </div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-8 px-5 py-14 sm:px-8 sm:py-16 md:grid-cols-3 lg:px-12">
        {[
          ["Share", "List skills you feel ready to teach. Your experience can help another student get started."],
          ["Learn", "Describe a skill you want to practice and what you hope to do with it."],
          ["Exchange", "Find a student with a complementary goal, then arrange a learning session together."],
        ].map(([title, description], index) => <article key={title} className="border-t-2 border-forest/25 pt-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">0{index + 1}</p><h2 className="mt-2 font-display text-xl font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></article>)}
      </section>
      <footer className="border-t border-ink/10 bg-white px-5 py-6 text-center text-xs text-slate-500">SkillSwap · Share a skill. Grow together.</footer>
    </main>
  </div>;
}
