import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import type { PublicUser } from "../auth/types";

const links = [
  { href: "/account", label: "Overview" }, { href: "/explore", label: "Explore" },
  { href: "/roadmap", label: "My roadmap" },
  { href: "/profile", label: "My profile" }, { href: "/my-skills", label: "My skills" },
  { href: "/requests", label: "Requests" }, { href: "/sessions", label: "Sessions" },
  { href: "/students", label: "Student rankings" },
  { href: "/messages", label: "Messages" }, { href: "/learning-rooms", label: "Learning rooms" },
];

type NotificationItem = { id: string; title: string; body: string; targetPath: "/requests" | "/messages"; createdAt: string; readAt: string | null };

function NotificationCenter() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () => void fetch("/api/notifications", { credentials: "include" })
      .then(async (response) => response.ok ? response.json() as Promise<{ notifications?: NotificationItem[]; unreadCount?: number }> : null)
      .then((payload) => { if (active && payload) { setItems(payload.notifications || []); setUnread(payload.unreadCount || 0); } })
      .catch(() => {});
    load();
    const timer = window.setInterval(load, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const markRead = async (item: NotificationItem) => {
    if (!item.readAt) {
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry));
      setUnread((count) => Math.max(0, count - 1));
      void fetch(`/api/notifications/${encodeURIComponent(item.id)}/read`, { method: "POST", credentials: "include" }).catch(() => {});
    }
    window.location.href = item.targetPath;
  };

  const markAllRead = () => {
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
    setUnread(0);
    void fetch("/api/notifications/read-all", { method: "POST", credentials: "include" }).catch(() => {});
  };

  return <div className="relative ml-auto sm:ml-0">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative inline-flex min-h-10 items-center gap-2 rounded-lg border border-ink/15 bg-white px-3 text-sm font-semibold text-ink hover:bg-paper focus-visible:outline-2 focus-visible:outline-forest">
      <span aria-hidden="true">🔔</span><span>Notifications</span>{unread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-red-700 px-1.5 py-0.5 text-[11px] text-white">{unread > 99 ? "99+" : unread}</span>}
    </button>
    {open && <section aria-label="Notifications" className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-ink/8 px-4 py-3"><h2 className="text-sm font-semibold">Notifications</h2>{unread > 0 && <button type="button" onClick={markAllRead} className="text-xs font-semibold text-forest underline">Mark all read</button>}</div>
      <div className="max-h-80 overflow-y-auto">
        {items.length === 0 ? <p className="px-4 py-6 text-sm text-slate-600">You’re all caught up.</p> : items.map((item) => <button type="button" key={item.id} onClick={() => void markRead(item)} className={`block w-full border-b border-ink/5 px-4 py-3 text-left hover:bg-paper ${item.readAt ? "" : "bg-emerald-50/70"}`}>
          <span className="block text-sm font-semibold text-ink">{item.title}</span><span className="mt-1 block text-xs text-slate-600">{item.body}</span><time className="mt-1 block text-[11px] text-slate-500">{new Date(item.createdAt + (item.createdAt.endsWith("Z") ? "" : "Z")).toLocaleString()}</time>
        </button>)}
      </div>
    </section>}
  </div>;
}

export function WorkspaceShell({ user, title, eyebrow, description, children, onLogout, loggingOut, logoutError }: {
  user: PublicUser; title: string; eyebrow: string; description: string; children: ReactNode;
  onLogout: () => void; loggingOut: boolean; logoutError: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = user.fullName.trim().split(/\s+/).slice(0, 2).map((name) => name[0]?.toUpperCase()).join("") || "S";
  const currentPath = window.location.pathname;
  const current = (href: string) => href === "/learning-rooms" ? currentPath.startsWith(href) : currentPath === href;

  return (
    <main className="workspace-shell min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-ink/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-[68px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-7 lg:px-10">
          <a href="/" aria-label="SkillSwap home" className="inline-flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest">
            <span className="grid size-9 place-items-center rounded-xl bg-forest text-lime"><Icon name="swap" className="size-5" /></span>
            <span className="font-display text-lg font-bold tracking-[-0.05em]">skill<span className="text-emerald-800">swap</span></span>
          </a>
          <div className="hidden items-center gap-3 sm:flex">
            <span className="grid size-9 place-items-center rounded-full bg-[#e9f1ed] text-xs font-bold text-forest" aria-hidden="true">{initials}</span>
            <span className="hidden max-w-40 truncate text-sm font-medium text-slate-600 md:block">{user.fullName}</span>
            {user.role === "admin" && <a href="/admin" className="rounded-full px-3 py-2 text-sm font-semibold text-forest transition hover:bg-[#eef4f1] focus-visible:outline-2 focus-visible:outline-forest">Admin</a>}
            <button type="button" onClick={onLogout} disabled={loggingOut} className="min-h-10 rounded-lg border border-ink/15 px-3.5 text-sm font-semibold text-ink transition hover:border-forest/40 hover:bg-paper focus-visible:outline-2 focus-visible:outline-forest disabled:opacity-60">{loggingOut ? "Signing out…" : "Sign out"}</button>
          </div>
          <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="workspace-navigation" aria-label={menuOpen ? "Close navigation" : "Open navigation"} className="grid size-11 place-items-center rounded-lg border border-ink/15 text-ink transition hover:bg-paper focus-visible:outline-2 focus-visible:outline-forest sm:hidden">
            <Icon name={menuOpen ? "x" : "menu"} className="size-5" />
          </button>
        </div>
        <nav id="workspace-navigation" aria-label="Your SkillSwap pages" className={`${menuOpen ? "block" : "hidden"} border-t border-ink/8 bg-white sm:block`}>
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3 sm:flex-row sm:overflow-x-auto sm:px-7 lg:px-10">
            {links.map(({ href, label }) => <a key={href} href={href} aria-current={current(href) ? "page" : undefined} onClick={() => setMenuOpen(false)} className={`min-h-10 rounded-lg px-3.5 py-2.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-forest sm:shrink-0 ${current(href) ? "bg-[#e9f1ed] font-semibold text-forest" : "text-slate-600 hover:bg-paper hover:text-ink"}`}>{label}</a>)}
            {user.role === "admin" && <a href="/admin" aria-current={currentPath === "/admin" ? "page" : undefined} className={`min-h-10 rounded-lg px-3.5 py-2.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-forest sm:shrink-0 ${currentPath === "/admin" ? "bg-[#e9f1ed] font-semibold text-forest" : "text-slate-600 hover:bg-paper hover:text-ink"}`}>Admin</a>}
            <a href="/" className="min-h-10 rounded-lg px-3.5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-forest sm:hidden">Back to homepage</a>
            <div className="mt-2 flex items-center justify-between border-t border-ink/8 pt-3 sm:hidden"><span className="text-sm text-slate-600">{user.fullName}</span><button type="button" onClick={onLogout} disabled={loggingOut} className="min-h-10 rounded-lg border border-ink/15 px-4 text-sm font-semibold text-ink disabled:opacity-60">{loggingOut ? "Signing out…" : "Sign out"}</button></div>
          </div>
        </nav>
        <div className="mx-auto flex max-w-7xl justify-end px-4 py-2 sm:px-7 lg:px-10"><NotificationCenter /></div>
      </header>
      {logoutError && <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-800">{logoutError}</p>}
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-7 sm:pt-10 lg:px-10 lg:pt-12">
        <div className="mb-7 max-w-3xl sm:mb-9">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">{eyebrow}</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.045em] text-ink sm:text-4xl">{title}</h1>
          <p className="mt-2.5 text-sm leading-6 text-slate-600 sm:text-base">{description}</p>
        </div>
        {children}
      </div>
    </main>
  );
}

export function WorkspaceInput({ id, label, value, onChange, error, maxLength, placeholder, required = false, multiline = false }: {
  id: string; label: string; value: string; onChange: (value: string) => void; error?: string;
  maxLength?: number; placeholder?: string; required?: boolean; multiline?: boolean;
}) {
  const shared = `field-control w-full rounded-lg border bg-white px-3.5 py-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-forest focus:ring-4 focus:ring-forest/10 ${error ? "border-red-600" : "border-slate-300 hover:border-slate-400"}`;
  return <div>
    <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">{label}{required && <span aria-hidden="true" className="text-red-700"> *</span>}</label>
    {multiline
      ? <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} placeholder={placeholder} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} rows={4} className={`${shared} min-h-28 resize-y`} />
      : <input id={id} value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} placeholder={placeholder} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className={`${shared} min-h-11`} />}
    {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-red-700">{error}</p>}
  </div>;
}

export function WorkspaceSelect({ id, label, value, options, onChange, error }: {
  id: string; label: string; value: string; options: readonly string[]; onChange: (value: string) => void; error?: string;
}) {
  return <div>
    <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">{label} <span className="text-red-700" aria-hidden="true">*</span></label>
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} className={`field-control min-h-11 w-full rounded-lg border bg-white px-3.5 py-3 text-sm text-ink outline-none transition focus:border-forest focus:ring-4 focus:ring-forest/10 ${error ? "border-red-600" : "border-slate-300 hover:border-slate-400"}`}>
      <option value="">Select one</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
    {error && <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">{error}</p>}
  </div>;
}
