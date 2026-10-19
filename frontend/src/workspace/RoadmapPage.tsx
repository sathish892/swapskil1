import { useEffect, useMemo, useState } from "react";
import type { PublicUser } from "../auth/types";
import { Icon } from "../components/Icon";
import { WorkspaceShell } from "./WorkspaceShell";

type RoadmapForm = { goal: string; outcome: string; level: string; focusAreas: string; hoursPerDay: number; daysPerWeek: number };
type RoadmapTask = { id: string; area: string; phase: string; detail: string; day: number; week: number; minutes: number };
type SavedRoadmap = { form: RoadmapForm; tasks: RoadmapTask[]; completed: string[] };
const defaultForm: RoadmapForm = { goal: "", outcome: "", level: "Beginner", focusAreas: "", hoursPerDay: 1, daysPerWeek: 5 };
const keyFor = (userId: string) => `skillswap-roadmap:${userId}`;
const phases = [
  { phase: "Learn", detail: "Study the core ideas and write down 3 key takeaways." },
  { phase: "Practice", detail: "Work through a guided exercise; note where you get stuck." },
  { phase: "Apply & review", detail: "Make a small outcome that uses this skill, then recap what you learned." },
];

function makeTasks(form: RoadmapForm): RoadmapTask[] {
  const areas = form.focusAreas.split(/[\n,;]/).map((area) => area.trim()).filter(Boolean).slice(0, 24);
  const safeAreas = areas.length ? areas : [form.goal.trim()];
  const daysPerWeek = Math.min(7, Math.max(1, Number(form.daysPerWeek) || 1));
  const sessions = safeAreas.flatMap((area) => phases.map((phase) => ({ area, ...phase })));
  const totalMinutes = Math.round(Number(form.hoursPerDay) * 60);
  const learnShare = form.level === "Beginner" ? 0.4 : form.level === "Intermediate" ? 0.3 : 0.2;
  const practiceShare = form.level === "Advanced" ? 0.65 : 0.45;
  const taskMinutes = [learnShare, practiceShare, 1 - learnShare - practiceShare].map((share) => Math.max(5, Math.round(totalMinutes * share / 5) * 5));
  return sessions.map((session, index) => {
    const studyDay = index + 1;
    return { id: `task-${index}`, area: session.area, phase: session.phase, detail: session.detail, day: studyDay, week: Math.ceil(studyDay / daysPerWeek), minutes: taskMinutes[index % 3] };
  }).map((task, index) => ({ ...task, day: (index % daysPerWeek) + 1, week: Math.floor(index / daysPerWeek) + 1 }));
}

function readSaved(key: string): SavedRoadmap | null {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as SavedRoadmap : null;
  } catch { return null; }
}

export function RoadmapPage({ user, onLogout, loggingOut, logoutError }: {
  user: PublicUser; onLogout: () => void; loggingOut: boolean; logoutError: string;
}) {
  const storageKey = keyFor(user.id);
  const [saved, setSaved] = useState<SavedRoadmap | null>(() => readSaved(storageKey));
  const [form, setForm] = useState<RoadmapForm>(() => readSaved(storageKey)?.form ?? defaultForm);
  const [error, setError] = useState("");
  useEffect(() => {
    try { if (saved) localStorage.setItem(storageKey, JSON.stringify(saved)); else localStorage.removeItem(storageKey); }
    catch { /* Keep the page usable when browser storage is unavailable. */ }
  }, [saved, storageKey]);

  const completedCount = saved?.completed.length ?? 0;
  const progress = saved?.tasks.length ? Math.round(completedCount / saved.tasks.length * 100) : 0;
  const weeks = useMemo(() => saved ? Array.from({ length: Math.ceil(saved.tasks.length / saved.form.daysPerWeek) }, (_, index) => ({
    number: index + 1,
    tasks: saved.tasks.filter((task) => task.week === index + 1),
  })) : [], [saved]);

  const update = (name: keyof RoadmapForm, value: string | number) => setForm((current) => ({ ...current, [name]: value }));
  const generate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const areas = form.focusAreas.split(/[\n,;]/).map((area) => area.trim()).filter(Boolean);
    if (!form.goal.trim() || !form.outcome.trim() || areas.length === 0) { setError("Add your learning goal, the outcome you want, and at least one skill or task to work on."); return; }
    setError("");
    setSaved({ form: { ...form, focusAreas: areas.join("\n") }, tasks: makeTasks(form), completed: [] });
  };

  return <WorkspaceShell user={user} title="Your learning roadmap" eyebrow="Make steady progress" description="Tell us what you want to learn and the time you have. Get a realistic daily plan you can follow and track." onLogout={onLogout} loggingOut={loggingOut} logoutError={logoutError}>
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
      <form onSubmit={generate} className="space-y-5 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm sm:p-7">
        <div><h2 className="font-display text-xl font-semibold">Build your plan</h2><p className="mt-1 text-sm leading-6 text-slate-600">A little detail helps us split the work into manageable study sessions.</p></div>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">What do you want to learn?</span><input value={form.goal} onChange={(event) => update("goal", event.target.value)} maxLength={100} placeholder="e.g. Web development" className="min-h-11 w-full rounded-lg border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-forest focus:ring-4 focus:ring-forest/10" /></label>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">What do you want to be able to do?</span><input value={form.outcome} onChange={(event) => update("outcome", event.target.value)} maxLength={160} placeholder="e.g. Build and publish my first portfolio website" className="min-h-11 w-full rounded-lg border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-forest focus:ring-4 focus:ring-forest/10" /></label>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">Your current level</span><select value={form.level} onChange={(event) => update("level", event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-forest focus:ring-4 focus:ring-forest/10"><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">Skills, topics, or tasks you need to work on</span><textarea value={form.focusAreas} onChange={(event) => update("focusAreas", event.target.value)} maxLength={1200} rows={5} placeholder={"Add one per line, for example:\nHTML and page structure\nCSS layouts\nJavaScript basics\nBuild a portfolio project"} className="w-full rounded-lg border border-slate-300 px-3.5 py-3 text-sm leading-6 outline-none focus:border-forest focus:ring-4 focus:ring-forest/10" /><span className="mt-1 block text-xs text-slate-500">Add up to 24 areas. We’ll give each one a learn, practice, and apply/review session.</span></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Study time per day</span><div className="flex items-center gap-2"><input type="number" min="0.25" max="8" step="0.25" value={form.hoursPerDay} onChange={(event) => update("hoursPerDay", Number(event.target.value))} className="min-h-11 w-full rounded-lg border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-forest" /><span className="text-sm text-slate-500">hours</span></div></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Study days per week</span><select value={form.daysPerWeek} onChange={(event) => update("daysPerWeek", Number(event.target.value))} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-forest">{[3, 4, 5, 6, 7].map((days) => <option key={days} value={days}>{days} days</option>)}</select></label>
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <button type="submit" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-forest px-5 text-sm font-semibold text-white transition hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"><Icon name="sparkles" className="size-4" />{saved ? "Update my roadmap" : "Create my roadmap"}</button>
      </form>

      <section aria-live="polite" className="min-w-0">
        {!saved ? <div className="rounded-2xl border border-dashed border-ink/15 bg-white p-8 text-center sm:p-12"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e4f0dc] text-forest"><Icon name="book" className="size-7" /></span><h2 className="mt-4 font-display text-xl font-semibold">Your plan will show up here</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">Fill in your goal and available study time to get a week-by-week roadmap with daily tasks.</p></div>
          : <div className="space-y-5">
            <div className="rounded-2xl bg-forest p-5 text-white sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-lime">Your goal</p><h2 className="mt-2 font-display text-2xl font-semibold">{saved.form.goal}</h2><p className="mt-1 text-sm text-white/75">{saved.form.outcome}</p></div><button type="button" onClick={() => setSaved(null)} aria-label="Delete roadmap" title="Delete roadmap" className="rounded-lg border border-white/25 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10">Reset</button></div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3"><div className="rounded-xl bg-white/10 p-3"><span className="block text-2xl font-semibold">{weeks.length}</span><span className="text-xs text-white/75">weeks estimated</span></div><div className="rounded-xl bg-white/10 p-3"><span className="block text-2xl font-semibold">{saved.form.hoursPerDay}h</span><span className="text-xs text-white/75">per study day</span></div><div className="col-span-2 rounded-xl bg-white/10 p-3 sm:col-span-1"><span className="block text-2xl font-semibold">{saved.tasks.length}</span><span className="text-xs text-white/75">planned sessions</span></div></div>
              <div className="mt-5"><div className="mb-1.5 flex justify-between text-xs text-white/80"><span>Progress</span><span>{completedCount}/{saved.tasks.length} sessions · {progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-lime transition-all" style={{ width: `${progress}%` }} /></div></div>
              <p className="mt-4 text-xs leading-5 text-white/70">Plan estimate uses your {saved.form.level.toLowerCase()} level and {saved.form.daysPerWeek} study days per week. Adjust the topic list if you need more detailed steps.</p>
            </div>
            {weeks.map((week) => <article key={week.number} className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-ink/8 bg-[#f4f6ef] px-4 py-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-800">Week {week.number}</p><h3 className="mt-0.5 font-display font-semibold">{week.tasks[0]?.area} {week.tasks.length > 1 ? `+ ${week.tasks.length - 1} session${week.tasks.length > 2 ? "s" : ""}` : ""}</h3></div><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">{week.tasks.reduce((sum, task) => sum + task.minutes, 0)} min</span></div><ol className="divide-y divide-ink/8">{week.tasks.map((task) => { const done = saved.completed.includes(task.id); return <li key={task.id} className="flex gap-3 px-4 py-4"><input type="checkbox" checked={done} onChange={() => setSaved((current) => current ? { ...current, completed: done ? current.completed.filter((id) => id !== task.id) : [...current.completed, task.id] } : current)} aria-label={`${done ? "Mark incomplete" : "Mark complete"}: ${task.phase} ${task.area}`} className="mt-1 size-4 accent-emerald-800" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`text-xs font-bold uppercase tracking-wide ${done ? "text-emerald-800" : "text-ink"}`}>Day {task.day} · {task.phase}</span><span className="text-xs text-slate-500">{task.minutes} min</span></div><p className={`mt-1 text-sm font-semibold ${done ? "text-slate-500 line-through" : "text-ink"}`}>{task.area}</p><p className="mt-1 text-xs leading-5 text-slate-600">{task.detail}</p></div></li>; })}</ol></article>)}
            <p className="px-1 text-xs leading-5 text-slate-500">Your roadmap is saved in this browser on this device. Mark each session done as you go.</p>
          </div>}
      </section>
    </div>
  </WorkspaceShell>;
}
