import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import type { PublicUser } from "../auth/types";

const links = [
  { label: "Home", href: "/#home" },
  { label: "Explore skills", href: "/explore" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "About", href: "/about" },
];

export function Navbar({
  onAccountAction,
  onLogout,
  user,
  loggingOut,
}: {
  onAccountAction: (action: "Log in" | "Sign up") => void;
  onLogout: () => void;
  user: PublicUser | null;
  loggingOut: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-ink/8 bg-paper/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
        <a
          href="/#home"
          onClick={closeMenu}
          aria-label="SkillSwap home"
          className="group inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-forest text-lime transition-transform duration-200 group-hover:-rotate-6">
            <Icon name="swap" className="size-5" />
          </span>
          <span className="font-display text-xl font-bold tracking-[-0.06em] text-ink">skill<span className="text-emerald-800">swap</span></span>
        </a>

        <nav aria-label="Main navigation" className="hidden items-center gap-8 lg:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-sm text-sm font-medium text-slate-600 transition-colors hover:text-forest focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {user ? (
            <>
              <a href="/account" className="rounded-sm text-sm font-medium text-slate-600 transition-colors hover:text-forest focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700">
                Dashboard
              </a>
              <a href="/profile" className="rounded-sm text-sm font-medium text-slate-600 transition-colors hover:text-forest focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700">Profile</a>
              {user.role === "admin" && <a href="/admin" className="rounded-sm text-sm font-semibold text-forest transition-colors hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700">Admin</a>}
              <button
                type="button"
                onClick={onLogout}
                disabled={loggingOut}
                className="rounded-full border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-ink/5 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-wait disabled:opacity-60"
              >
                {loggingOut ? "Logging out…" : "Log out"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onAccountAction("Log in")}
                className="rounded-full px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-ink/5 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => onAccountAction("Sign up")}
                className="rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-emerald-950 hover:shadow-lg hover:shadow-forest/15 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              >
                Sign up <span aria-hidden="true">↗</span>
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          className="grid size-11 place-items-center rounded-full border border-ink/10 text-ink transition-colors hover:bg-ink/5 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 lg:hidden"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Icon name={menuOpen ? "x" : "menu"} className="size-5" />
        </button>
      </div>

      <div id="mobile-navigation" hidden={!menuOpen} className="border-t border-ink/8 bg-paper px-5 pb-6 pt-3 shadow-xl shadow-ink/5 lg:hidden">
        <nav aria-label="Mobile navigation" className="mx-auto flex max-w-7xl flex-col">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={closeMenu}
              className="rounded-xl px-3 py-3.5 text-base font-medium text-slate-700 transition-colors hover:bg-emerald-50 hover:text-forest focus-visible:outline-2 focus-visible:outline-emerald-700"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-3 border-t border-ink/8 pt-5">
            {user ? (
              <div className="space-y-3">
                <p className="truncate text-sm font-medium text-slate-600">Signed in as {user.fullName}</p>
                <div className="grid grid-cols-2 gap-2"><a href="/account" onClick={closeMenu} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 text-sm font-semibold text-ink">Dashboard</a><a href="/profile" onClick={closeMenu} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 text-sm font-semibold text-ink">Profile</a>{user.role === "admin" && <a href="/admin" onClick={closeMenu} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 text-sm font-semibold text-forest">Admin</a>}</div>
                <button
                  type="button"
                  onClick={() => { closeMenu(); onLogout(); }}
                  disabled={loggingOut}
                  className="min-h-11 w-full rounded-lg bg-forest px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-950 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-wait disabled:opacity-60"
                >
                  {loggingOut ? "Logging out…" : "Log out"}
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { closeMenu(); onAccountAction("Log in"); }}
                  className="min-h-11 flex-1 rounded-full border border-ink/15 px-4 text-sm font-semibold text-ink transition-colors hover:bg-ink/5 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => { closeMenu(); onAccountAction("Sign up"); }}
                  className="min-h-11 flex-1 rounded-full bg-forest px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-950 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                >
                  Sign up
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
