import { useEffect, useMemo, useState } from "react";
import type { PublicUser } from "../auth/types";
import { Icon } from "../components/Icon";
import { WorkspaceShell } from "./WorkspaceShell";

type Form = { goal: string; interests: string; knownSkills: string; hoursPerDay: number };
type Lesson = { title: string; durationMinutes: number; learnAt: string; learnUrl: string; steps: string[]; practice: string; deliverable: string };
type Phase = { title: string; purpose: string; sessions: Lesson[] };
type Plan = { roleSummary: string; inputAnalysis: string; strengths: string[]; skillGaps: string[]; assumptions: string[]; phases: Phase[]; projects: string[] };
type Reference = { title: string; url: string };
type Task = { id: string; week: number; day: number; phase: string; phasePurpose: string; title: string; learnAt: string; learnUrl: string; steps: string[]; practice: string; deliverable: string; minutes: number; done: boolean };
type Saved = { form: Form; plan: Plan; references: Reference[]; tasks: Task[] };
type SavedRoadmaps = { activeRole: string; items: Record<string, Saved> };
const defaultForm: Form = { goal: "", interests: "", knownSkills: "", hoursPerDay: 1.5 };
const keyFor = (id: string) => `skillswap-career-roadmaps-v3:${id}`;
const legacyKeyFor = (id: string) => `skillswap-career-roadmap-v2:${id}`;
const roleKey = (goal: string) => goal.trim().toLocaleLowerCase().replace(/\s+/g, " ");
function readRoadmaps(key: string, legacyKey: string): SavedRoadmaps {
  try {
    const raw = localStorage.getItem(key);
    if (raw) { const value = JSON.parse(raw) as SavedRoadmaps; if (value.items && typeof value.items === "object") return value; }
    const old = localStorage.getItem(legacyKey);
    if (old) { const saved = JSON.parse(old) as Saved; if (saved.form?.goal) { const id = roleKey(saved.form.goal); return { activeRole: id, items: { [id]: saved } }; } }
  } catch { /* Saved roadmaps are optional if browser storage is unavailable. */ }
  return { activeRole: "", items: {} };
}
function timeLabel(minutes: number) { const h = Math.floor(minutes / 60); const m = minutes % 60; return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ") || "0m"; }
function makeTasks(form: Form, plan: Plan): Task[] {
  const daily = Math.round(form.hoursPerDay * 60);
  let dayIndex = 0; let used = 0; const tasks: Task[] = [];
  for (const phase of plan.phases) for (const lesson of phase.sessions || []) {
    const minutes = Math.max(15, Math.min(daily, Number(lesson.durationMinutes) || daily));
    if (used + minutes > daily) { dayIndex += 1; used = 0; }
    tasks.push({ id: `task-${tasks.length}`, week: Math.floor(dayIndex / 5) + 1, day: dayIndex % 5 + 1, phase: phase.title, phasePurpose: phase.purpose, title: lesson.title, learnAt: lesson.learnAt, learnUrl: lesson.learnUrl, steps: lesson.steps || [], practice: lesson.practice, deliverable: lesson.deliverable, minutes, done: false });
    used += minutes;
    if (used >= daily) { dayIndex += 1; used = 0; }
    }
  return tasks;
}

export function RoadmapPage({ user, onLogout, loggingOut, logoutError }: { user: PublicUser; onLogout: () => void; loggingOut: boolean; logoutError: string }) {
  const storageKey = keyFor(user.id); const initial = readRoadmaps(storageKey, legacyKeyFor(user.id));
  const [roadmaps, setRoadmaps] = useState<Record<string, Saved>>(() => initial.items); const [activeRole, setActiveRole] = useState(() => initial.activeRole);
  const saved = activeRole ? roadmaps[activeRole] ?? null : null;
  const [form, setForm] = useState<Form>(() => saved?.form ?? defaultForm); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { try { if (Object.keys(roadmaps).length) localStorage.setItem(storageKey, JSON.stringify({ items: roadmaps, activeRole })); else localStorage.removeItem(storageKey); } catch { /* local storage is optional */ } }, [roadmaps, activeRole, storageKey]);
  const weeks = useMemo(() => saved ? Array.from({ length: Math.max(0, ...saved.tasks.map((task) => task.week)) }, (_, i) => ({ number: i + 1, tasks: saved.tasks.filter((task) => task.week === i + 1) })) : [], [saved]);
  const totalMinutes = saved?.tasks.reduce((sum, task) => sum + task.minutes, 0) ?? 0; const doneCount = saved?.tasks.filter((task) => task.done).length ?? 0;
  const update = <K extends keyof Form,>(name: K, value: Form[K]) => setForm((current) => ({ ...current, [name]: value }));
  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (form.goal.trim().length < 2) { setError("Tell us the role or career you want to work toward."); return; }
    if (!Number.isFinite(form.hoursPerDay) || form.hoursPerDay < 0.5 || form.hoursPerDay > 8) { setError("Choose study time between 0.5 and 8 hours per day."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/career-roadmaps/generate", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const payload = await response.json();
      if (response.status === 401) { window.location.assign(`/login?redirect=${encodeURIComponent("/roadmap")}`); return; }
      if (!response.ok) throw new Error(payload.error || "Could not analyze your career goal.");
      const tasks = makeTasks(form, payload.plan as Plan); const id = roleKey(form.goal); setRoadmaps((current) => ({ ...current, [id]: { form, plan: payload.plan, references: payload.references || [], tasks } })); setActiveRole(id);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not analyze your career goal. Please try again."); }
    finally { setBusy(false); }
  }
  const toggle = (id: string) => setRoadmaps((current) => {
    const plan = current[activeRole]; if (!plan) return current;
    return { ...current, [activeRole]: { ...plan, tasks: plan.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task) } };
  });

  return <WorkspaceShell user={user} title="Career roadmap" eyebrow="AI powered career planning" description="Tell us what work you want to do, what you already know, what interests you, and how much time you can study. The AI researches the role and builds a paced plan with references." onLogout={onLogout} loggingOut={loggingOut} logoutError={logoutError}>
    <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
      <form onSubmit={generate} className="space-y-5 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm sm:p-7">
        <div><h2 className="font-display text-xl font-semibold">Describe your goal</h2><p className="mt-1 text-sm leading-6 text-slate-600">Your answers drive the role analysis and the learning sequence.</p></div>
        {Object.keys(roadmaps).length > 0 && <div className="rounded-xl border border-ink/10 bg-paper p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-600">Your saved roadmaps</p><div className="mt-2 flex flex-wrap gap-2">{Object.entries(roadmaps).sort((a, b) => a[1].form.goal.localeCompare(b[1].form.goal)).map(([id, roadmap]) => <button key={id} type="button" onClick={() => { setActiveRole(id); setForm(roadmap.form); setError(""); }} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${activeRole === id ? "border-forest bg-forest text-white" : "border-ink/15 bg-white text-forest hover:bg-[#e4f0dc]"}`}>{roadmap.form.goal}</button>)}</div></div>}
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">What role or work do you want to do?</span><input required maxLength={180} value={form.goal} onChange={(e) => update("goal", e.target.value)} placeholder="e.g. SOC Analyst, UX designer, data analyst" className="min-h-11 w-full rounded-lg border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-forest" /></label>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">What parts of this work interest you?</span><textarea maxLength={1000} value={form.interests} onChange={(e) => update("interests", e.target.value)} placeholder="e.g. investigating alerts, threat hunting, working with cloud security" rows={3} className="w-full rounded-lg border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-forest" /></label>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">What do you already know or have experience with?</span><textarea maxLength={1200} value={form.knownSkills} onChange={(e) => update("knownSkills", e.target.value)} placeholder="List skills, courses, tools, projects, or experience. It's okay to be a beginner." rows={3} className="w-full rounded-lg border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-forest" /></label>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">How much time can you study each day?</span><div className="flex items-center gap-2"><input type="number" min="0.5" max="8" step="0.5" value={form.hoursPerDay} onChange={(e) => update("hoursPerDay", Number(e.target.value))} className="min-h-11 max-w-48 rounded-lg border border-slate-300 px-3.5 py-3 text-sm" /><span className="text-sm text-slate-500">hours per study day</span></div><span className="mt-1 block text-xs text-slate-500">We’ll choose the lesson sequence and estimate the finish time. We use five study days a week, with two flexible/rest days.</span></label>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <button disabled={busy} type="submit" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-forest px-5 text-sm font-semibold text-white transition hover:bg-emerald-950 disabled:cursor-wait disabled:opacity-70"><Icon name="sparkles" className="size-4" />{busy ? "Researching your goal…" : saved ? "Re-analyze and update roadmap" : "Analyze my goal & build roadmap"}</button>
      </form>
      <section aria-live="polite" className="min-w-0">
        {!saved ? <div className="rounded-2xl border border-dashed border-ink/15 bg-white p-8 text-center sm:p-12"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e4f0dc] text-forest"><Icon name="sparkles" className="size-7" /></span><h2 className="mt-4 font-display text-xl font-semibold">Your career plan will appear here</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">We’ll research the role, compare it with what you know and enjoy, then shape a daily plan around your available study time.</p></div>
          : <div className="space-y-5">
            <div className="rounded-2xl bg-forest p-5 text-white sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-lime">AI role analysis · {saved.form.goal}</p><h2 className="mt-2 font-display text-2xl font-semibold">Your path, broken into doable steps</h2><p className="mt-2 text-sm leading-6 text-white/80">{saved.plan.roleSummary}</p></div><button type="button" onClick={() => setActiveRole("")} className="rounded-lg border border-white/25 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10">New roadmap</button></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3"><div className="rounded-xl bg-white/10 p-3"><span className="block text-2xl font-semibold">{weeks.length}</span><span className="text-xs text-white/75">weeks estimated</span></div><div className="rounded-xl bg-white/10 p-3"><span className="block text-2xl font-semibold">{timeLabel(saved.form.hoursPerDay * 60)}</span><span className="text-xs text-white/75">per study day</span></div><div className="col-span-2 rounded-xl bg-white/10 p-3 sm:col-span-1"><span className="block text-2xl font-semibold">~{Math.ceil(totalMinutes / 60)}h</span><span className="text-xs text-white/75">estimated effort</span></div></div><div className="mt-5"><div className="mb-1.5 flex justify-between text-xs text-white/80"><span>Progress</span><span>{doneCount}/{saved.tasks.length} blocks · {saved.tasks.length ? Math.round(doneCount / saved.tasks.length * 100) : 0}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-lime" style={{ width: `${saved.tasks.length ? doneCount / saved.tasks.length * 100 : 0}%` }} /></div></div><p className="mt-4 text-xs leading-5 text-white/70">A planning estimate based on AI research and the availability you gave. Adjust the pace as you learn; it is not a job guarantee.</p></div>
            <article className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm"><h3 className="font-display text-lg font-semibold">How your answers shaped this plan</h3><p className="mt-2 text-sm leading-6 text-slate-700">{saved.plan.inputAnalysis}</p>{saved.plan.strengths.length > 0 && <><h4 className="mt-4 text-sm font-semibold">Starting strengths</h4><ul className="mt-1 list-inside list-disc text-sm leading-6 text-slate-600">{saved.plan.strengths.map((item, i) => <li key={i}>{item}</li>)}</ul></>}{saved.plan.skillGaps.length > 0 && <><h4 className="mt-4 text-sm font-semibold">Skills to build</h4><ul className="mt-1 list-inside list-disc text-sm leading-6 text-slate-600">{saved.plan.skillGaps.map((item, i) => <li key={i}>{item}</li>)}</ul></>}{saved.plan.assumptions.length > 0 && <p className="mt-3 text-xs leading-5 text-slate-500">Assumptions: {saved.plan.assumptions.join(" · ")}</p>}</article>
            <p className="px-1 text-xs leading-5 text-slate-500">Each day shows where to learn, steps to follow, a small practice task, and a result to save. The finish estimate assumes five study days a week; take the two remaining days for rest or catch-up.</p>
            {weeks.map((week) => <article key={week.number} className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-ink/8 bg-[#f4f6ef] px-4 py-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-800">Week {week.number}</p><h3 className="mt-0.5 font-display font-semibold">{week.tasks.reduce((n, task) => n + task.minutes, 0)} min · {week.tasks.length} study block{week.tasks.length === 1 ? "" : "s"}</h3></div><span className="text-xs font-semibold text-slate-600">{week.tasks.filter((task) => task.done).length}/{week.tasks.length} done</span></div><ol className="divide-y divide-ink/8">{week.tasks.map((task) => <li key={task.id} className="flex gap-3 px-4 py-4"><input type="checkbox" checked={task.done} onChange={() => toggle(task.id)} aria-label={`${task.done ? "Mark incomplete" : "Mark complete"}: ${task.title}`} className="mt-1 size-4 accent-emerald-800" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase tracking-wide text-emerald-800">Day {task.day}</span><span className="text-xs text-slate-500">{timeLabel(task.minutes)}</span><span className="text-xs text-slate-400">{task.phase}</span></div><p className={`mt-1 text-sm font-semibold ${task.done ? "text-slate-500 line-through" : "text-ink"}`}>{task.title}</p>{task.phasePurpose && <p className="mt-1 text-xs leading-5 text-slate-600">Why this step: {task.phasePurpose}</p>}<p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Learn here</p>{task.learnUrl ? <a className="text-xs font-semibold text-forest underline underline-offset-2" href={task.learnUrl} target="_blank" rel="noreferrer">{task.learnAt || "Open the learning resource"} <Icon name="arrow-up-right" className="inline size-3" /></a> : <p className="text-xs text-slate-500">Use the related research links at the end of this roadmap.</p>}<div className="mt-2"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Do these steps</p><ol className="mt-1 list-inside list-decimal space-y-1 text-xs leading-5 text-slate-700">{task.steps.map((step, i) => <li key={i}>{step}</li>)}</ol></div><p className="mt-2 text-xs leading-5"><strong>Try it:</strong> {task.practice}</p><p className="mt-1 text-xs leading-5"><strong>Save/show:</strong> {task.deliverable}</p></div></li>)}</ol></article>)}
            {saved.plan.projects.length > 0 && <article className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm"><h3 className="font-display text-lg font-semibold">Portfolio ideas matched to your goal</h3><ul className="mt-2 list-inside list-disc text-sm leading-6 text-slate-700">{saved.plan.projects.map((project, i) => <li key={i}>{project}</li>)}</ul></article>}
            {saved.references.length > 0 && <article className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm"><h3 className="font-display text-lg font-semibold">Research references</h3><p className="mt-1 text-xs leading-5 text-slate-600">Sources returned with the role research. Open them to review the original material.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{saved.references.map((ref) => <a key={ref.url} href={ref.url} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-ink/10 px-3 py-2 text-xs font-semibold text-forest hover:bg-paper"><span>{ref.title}</span><Icon name="arrow-up-right" className="size-4 shrink-0" /></a>)}</div></article>}
            <p className="px-1 text-xs leading-5 text-slate-500">Your answers, plan, and completed study blocks are saved in this browser on this device.</p>
          </div>}
      </section>
    </div>
  </WorkspaceShell>;
}
