import { useEffect, useMemo, useState } from "react";
import type { PublicUser } from "../auth/types";
import { Icon } from "../components/Icon";
import { WorkspaceShell } from "./WorkspaceShell";

type SkillKey = "networking" | "systems" | "security" | "soc" | "siem" | "queries" | "incidents";
type InterestKey = "triage" | "threat-hunting" | "phishing" | "endpoint" | "cloud";
type PlannerForm = { role: string; hoursPerDay: number; daysPerWeek: number; platform: string; knownSkills: SkillKey[]; interests: InterestKey[] };
type Resource = { label: string; url: string };
type Activity = { title: string; detail: string; hours: number };
type Phase = { id: string; title: string; description: string; activities: Activity[]; references: Resource[] };
type StudyTask = { id: string; dayNumber: number; week: number; dayInWeek: number; phase: string; title: string; detail: string; minutes: number; done: boolean };
type SavedPlan = { form: PlannerForm; tasks: StudyTask[] };

const defaultForm: PlannerForm = { role: "SOC Analyst", hoursPerDay: 1.5, daysPerWeek: 5, platform: "Microsoft Sentinel (KQL)", knownSkills: [], interests: ["triage" ] };
const storageKey = (userId: string) => `skillswap-career-roadmap:${userId}`;
const skillOptions: { id: SkillKey; label: string }[] = [
  { id: "networking", label: "Networking basics (IP, DNS, ports, HTTP/S)" },
  { id: "systems", label: "Windows or Linux administration and logs" },
  { id: "security", label: "Security fundamentals and common attacks" },
  { id: "soc", label: "SOC alert triage and incident workflow" },
  { id: "siem", label: "Using a SIEM to search logs" },
  { id: "queries", label: "Writing KQL or SPL searches" },
  { id: "incidents", label: "Investigating phishing or endpoint alerts" },
];
const interestOptions: { id: InterestKey; label: string }[] = [
  { id: "triage", label: "Alert triage & incident response" },
  { id: "threat-hunting", label: "Threat hunting & detection" },
  { id: "phishing", label: "Phishing & threat intelligence" },
  { id: "endpoint", label: "Windows/Linux endpoint security" },
  { id: "cloud", label: "Cloud identities & Microsoft security" },
];
const refs = {
  nice: { label: "NIST NICE Framework", url: "https://www.nist.gov/itl/applied-cybersecurity/nice/nice-framework-resource-center/getting-started" },
  microsoftCareer: { label: "Microsoft: Security Operations Analyst career path", url: "https://learn.microsoft.com/en-us/training/career-paths/security-operations-analyst" },
  sc200: { label: "Microsoft SC-200 study guide", url: "https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/SC-200" },
  kql: { label: "Microsoft Learn: Create Sentinel queries with KQL", url: "https://learn.microsoft.com/en-us/training/paths/sc-200-utilize-kql-for-azure-sentinel/" },
  sentinel: { label: "Microsoft Sentinel skill-up training", url: "https://learn.microsoft.com/en-us/azure/sentinel/skill-up-resources" },
  splunk: { label: "Splunk Search tutorial", url: "https://help.splunk.com/en/splunk-enterprise/get-started/search-tutorial/10.0/introduction/about-the-search-tutorial" },
  thm: { label: "TryHackMe SOC Level 1 pathway", url: "https://tryhackme.com/path/outline/soclevel1" },
  cisa: { label: "CISA Incident Response Playbook", url: "https://www.cisa.gov/sites/default/files/publications/Cybersecurity_Incident_Vulnerability_Response_Playbooks_508C.pdf" },
};

function createPhases(form: PlannerForm): Phase[] {
  const platformName = form.platform.startsWith("Splunk") ? "Splunk Search (SPL)" : "Microsoft Sentinel (KQL)";
  const interest = form.interests.map((id) => interestOptions.find((option) => option.id === id)?.label).filter(Boolean).join(", ") || "core SOC operations";
  const capstone = form.interests.includes("phishing") ? "Investigate a simulated phishing case: inspect sender, links, indicators, affected account, and write a clear escalation." : form.interests.includes("threat-hunting") ? "Hunt for suspicious sign-ins or endpoint behavior, document your hypothesis, query, evidence, and detection idea." : form.interests.includes("cloud") ? "Investigate an unusual sign-in, correlate identity and endpoint events, and propose a safe response." : form.interests.includes("endpoint") ? "Investigate a simulated endpoint alert, build a timeline, identify evidence, and recommend containment." : "Triage a simulated alert from first signal to evidence-backed decision and concise handoff.";
  return [
    { id: "foundations", title: "1. Build the IT & security foundations", description: "SOC investigations make more sense when you can explain what the system normally does.", activities: [
      { title: "Networking for investigations", detail: "Trace a sample connection. Identify source/destination IP, DNS lookup, port, protocol, and what an HTTP request reveals.", hours: 10 },
      { title: "Windows, Linux & event logs", detail: "Inspect processes, users, services, and authentication logs. Explain which event fields help answer who did what and when.", hours: 10 },
      { title: "Security fundamentals", detail: "Review identity, least privilege, malware, phishing, vulnerabilities, and common attacker behavior. Make a one-page glossary.", hours: 8 },
    ], references: [refs.nice, refs.thm] },
    { id: "soc", title: "2. Learn how a SOC works", description: "Practice the analyst workflow: validate, prioritize, investigate, record, and escalate.", activities: [
      { title: "Alert triage & severity", detail: "For sample alerts, separate signal from noise, identify affected user/device, estimate impact, and justify priority.", hours: 6 },
      { title: "Incident workflow & reporting", detail: "Write a short incident timeline with evidence, actions taken, unresolved questions, and a clear escalation recommendation.", hours: 6 },
      { title: "Map behavior to MITRE ATT&CK", detail: "Take three example behaviors and map each to a tactic/technique. Explain what evidence would confirm or reject it.", hours: 6 },
    ], references: [refs.nice, refs.microsoftCareer, refs.cisa, refs.thm] },
    { id: "siem", title: `3. Use a SIEM: ${platformName}`, description: "A SOC analyst needs to search, connect, and interpret events—not just click through dashboards.", activities: [
      { title: "Understand log sources & fields", detail: `Load or explore sample authentication, endpoint, and network events in ${platformName}. Identify timestamps, users, hosts, IPs, and event types.`, hours: 8 },
      { title: "Write useful searches", detail: form.platform.startsWith("Splunk") ? "Use SPL to filter events, group by user/host, count failures, and find unusual time windows." : "Use KQL to filter tables, project fields, summarize events, and join related activity." , hours: 12 },
      { title: "Build a small detection", detail: "Create a query for repeated failed logins or an unusual sign-in pattern. Explain the alert condition and one likely false positive.", hours: 8 },
    ], references: form.platform.startsWith("Splunk") ? [refs.splunk, refs.thm] : [refs.kql, refs.sentinel, refs.sc200] },
    { id: "investigations", title: "4. Investigate common alerts", description: "Turn alerts into a defensible decision using evidence, context, and a written handoff.", activities: [
      { title: "Phishing investigation", detail: "Review a safe training sample: sender/domain, links, attachment indicators, user actions, and related sign-ins. Record evidence before deciding.", hours: 8 },
      { title: "Identity & account compromise", detail: "Correlate sign-in time, source location, device, failed/successful logins, and related events. Decide what to escalate.", hours: 8 },
      { title: "Endpoint investigation", detail: "Build a process and event timeline for a simulated endpoint alert. Identify parent/child process clues and recommend next steps.", hours: 8 },
      { title: "Incident response & communication", detail: "Practice containment/escalation choices and write a concise incident report with impact, confidence, evidence, and follow-up.", hours: 6 },
    ], references: [refs.cisa, refs.sc200, refs.thm] },
    { id: "hunting", title: "5. Threat hunting & detection thinking", description: "Move from one alert to a testable hypothesis about suspicious behavior across many events.", activities: [
      { title: "Create a hunt hypothesis", detail: `Choose a behavior related to ${interest}. Define what data should exist if the hypothesis is true and what would disprove it.`, hours: 8 },
      { title: "Query, correlate & document", detail: `Use ${platformName} to search a provided dataset, correlate related events, and save the query with a short explanation.`, hours: 8 },
      { title: "Tune a detection", detail: "Refine the query, state expected false positives, and write a simple analyst runbook for validating future alerts.", hours: 8 },
      { title: "Automate a repetitive check", detail: "Use a small Python or PowerShell script to parse a sample log export, group repeated events, and explain where automation helps and where an analyst still needs to review context.", hours: 6 },
    ], references: [refs.kql, refs.sentinel, refs.sc200, refs.thm] },
    { id: "portfolio", title: "6. Prove your skills with a portfolio", description: "Show what you can do with concrete, explainable work samples.", activities: [
      { title: "Finish an interest-led capstone", detail: capstone, hours: 8 },
      { title: "Publish investigation notes", detail: "Create a sanitized case report: scenario, timeline, evidence, query/screenshots, conclusion, and lessons learned. Never publish real personal or company data.", hours: 6 },
      { title: "Prepare for entry-level interviews", detail: "Practice explaining alert triage, one investigation, one query, uncertainty, and when/how you would escalate. Identify two remaining skill gaps.", hours: 6 },
    ], references: [refs.microsoftCareer, refs.sc200, refs.thm] },
  ];
}

const skillCredit: Record<SkillKey, { phase: string; hours: number }> = {
  networking: { phase: "foundations", hours: 6 }, systems: { phase: "foundations", hours: 6 }, security: { phase: "foundations", hours: 4 },
  soc: { phase: "soc", hours: 5 }, siem: { phase: "siem", hours: 7 }, queries: { phase: "siem", hours: 6 }, incidents: { phase: "investigations", hours: 5 },
};
function readSaved(key: string): SavedPlan | null { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as SavedPlan : null; } catch { return null; } }
function formatTime(minutes: number) { const h = Math.floor(minutes / 60); const m = minutes % 60; return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ") || "0m"; }
function buildSchedule(form: PlannerForm): StudyTask[] {
  const phases = createPhases(form);
  const dayBudget = Math.max(30, Math.min(480, Number(form.hoursPerDay) * 60));
  const daysPerWeek = Math.max(1, Number(form.daysPerWeek));
  const reductions = new Map<string, number>();
  form.knownSkills.forEach((skill) => { const credit = skillCredit[skill]; reductions.set(credit.phase, (reductions.get(credit.phase) ?? 0) + credit.hours); });
  const tasks: StudyTask[] = [];
  let dayNumber = 1;
  let minutesToday = 0;
  phases.forEach((phase) => {
    const baseHours = phase.activities.reduce((sum, activity) => sum + activity.hours, 0);
    const remainingHours = Math.max(baseHours * 0.55, baseHours - (reductions.get(phase.id) ?? 0));
    const scale = remainingHours / baseHours;
    phase.activities.forEach((activity) => {
      let remaining = activity.hours * scale * 60;
      let part = 0;
      while (remaining > 0.01) {
        if (minutesToday >= dayBudget - 0.01) { dayNumber += 1; minutesToday = 0; }
        const chunk = Math.min(remaining, dayBudget - minutesToday);
        part += 1;
        const splitAcrossDays = activity.hours * scale * 60 > dayBudget || remaining - chunk > 0.01;
        tasks.push({ id: `study-${tasks.length}`, dayNumber, week: Math.floor((dayNumber - 1) / daysPerWeek) + 1, dayInWeek: ((dayNumber - 1) % daysPerWeek) + 1, phase: phase.title, title: splitAcrossDays ? `${activity.title} · part ${part}` : activity.title, detail: part > 1 ? `Continue this exercise and add a new finding to your notes. ${activity.detail}` : activity.detail, minutes: Math.max(1, Math.round(chunk)), done: false });
        remaining -= chunk;
        minutesToday += chunk;
      }
    });
  });
  return tasks;
}

export function RoadmapPage({ user, onLogout, loggingOut, logoutError }: { user: PublicUser; onLogout: () => void; loggingOut: boolean; logoutError: string }) {
  const key = storageKey(user.id);
  const existing = readSaved(key);
  const [form, setForm] = useState<PlannerForm>(() => existing?.form ?? defaultForm);
  const [plan, setPlan] = useState<SavedPlan | null>(() => existing);
  const [error, setError] = useState("");
  useEffect(() => { try { if (plan) localStorage.setItem(key, JSON.stringify(plan)); else localStorage.removeItem(key); } catch { /* Keep the planner usable if local storage is unavailable. */ } }, [plan, key]);
  const phases = useMemo(() => plan ? createPhases(plan.form) : [], [plan]);
  const weeks = useMemo(() => plan ? Array.from({ length: Math.ceil(Math.max(0, ...plan.tasks.map((task) => task.dayNumber)) / plan.form.daysPerWeek) }, (_, index) => ({ number: index + 1, tasks: plan.tasks.filter((task) => task.week === index + 1) })) : [], [plan]);
  const completed = plan?.tasks.filter((task) => task.done).length ?? 0;
  const progress = plan?.tasks.length ? Math.round(completed / plan.tasks.length * 100) : 0;
  const totalHours = plan ? Math.round(plan.tasks.reduce((sum, task) => sum + task.minutes, 0) / 60) : 0;
  const toggle = (id: string) => setPlan((current) => current ? { ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task) } : current);
  const generate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/\bsoc\b|security[\s-]*operations/i.test(form.role)) { setError("This reference-backed roadmap currently supports SOC Analyst. More career paths can be added next."); return; }
    if (!Number.isFinite(form.hoursPerDay) || form.hoursPerDay < 0.5 || form.hoursPerDay > 8) { setError("Choose study time between 0.5 and 8 hours per day."); return; }
    if (!form.daysPerWeek || form.daysPerWeek < 3 || form.daysPerWeek > 7) { setError("Choose between 3 and 7 study days per week."); return; }
    if (form.interests.length === 0) { setError("Choose at least one SOC work area that interests you so we can tailor the capstone."); return; }
    setError("");
    const normalized = { ...form, role: "SOC Analyst" };
    setForm(normalized);
    setPlan({ form: normalized, tasks: buildSchedule(normalized) });
  };
  const update = <K extends keyof PlannerForm,>(name: K, value: PlannerForm[K]) => setForm((current) => Object.assign({}, current, { [name]: value }) as PlannerForm);

  return <WorkspaceShell user={user} title="Career roadmap" eyebrow="A plan built around your goal" description="Choose a career target, tell us what you already know, what parts interest you, and how much time you can study. We’ll turn the role skills into a paced, reference-backed plan." onLogout={onLogout} loggingOut={loggingOut} logoutError={logoutError}>
    <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
      <form onSubmit={generate} className="space-y-5 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm sm:p-7">
        <div><h2 className="font-display text-xl font-semibold">Tell us about your goal</h2><p className="mt-1 text-sm leading-6 text-slate-600">The roadmap supplies the skills and projects for the role. You personalize the pace and focus.</p></div>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">Career goal</span><input value={form.role} onChange={(event) => update("role", event.target.value)} placeholder="e.g. SOC Analyst" className="min-h-11 w-full rounded-lg border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-forest focus:ring-4 focus:ring-forest/10" /><span className="mt-1 block text-xs text-slate-500">Detailed role analysis is currently available for SOC Analyst.</span></label>
        <fieldset><legend className="mb-2 text-sm font-semibold">What do you already feel comfortable doing?</legend><p className="mb-2 text-xs text-slate-500">Select the skills you can demonstrate; we’ll reduce that part of the study estimate.</p><div className="space-y-2">{skillOptions.map((skill) => <label key={skill.id} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-ink/8 px-3 py-2.5 text-sm text-slate-700 hover:bg-paper"><input type="checkbox" checked={form.knownSkills.includes(skill.id)} onChange={(event) => update("knownSkills", event.target.checked ? [...form.knownSkills, skill.id] : form.knownSkills.filter((id) => id !== skill.id))} className="mt-0.5 size-4 accent-emerald-800" />{skill.label}</label>)}</div></fieldset>
        <fieldset><legend className="mb-2 text-sm font-semibold">Which SOC work interests you?</legend><p className="mb-2 text-xs text-slate-500">Choose any that sound exciting. We’ll tailor your capstone and practice emphasis.</p><div className="flex flex-wrap gap-2">{interestOptions.map((interest) => { const selected = form.interests.includes(interest.id); return <label key={interest.id} className={`cursor-pointer rounded-full border px-3 py-2 text-xs font-medium transition ${selected ? "border-forest bg-[#e9f1ed] text-forest" : "border-ink/15 text-slate-600 hover:bg-paper"}`}><input type="checkbox" className="sr-only" checked={selected} onChange={(event) => update("interests", event.target.checked ? [...form.interests, interest.id] : form.interests.filter((id) => id !== interest.id))} />{interest.label}</label>; })}</div></fieldset>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">Practice platform</span><select value={form.platform} onChange={(event) => update("platform", event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-forest"><option>Microsoft Sentinel (KQL)</option><option>Splunk Search (SPL)</option></select><span className="mt-1 block text-xs text-slate-500">Both are useful SIEM paths; choose one to focus your first portfolio.</span></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-sm font-semibold">Study time per day</span><div className="flex items-center gap-2"><input type="number" min="0.5" max="8" step="0.5" value={form.hoursPerDay} onChange={(event) => update("hoursPerDay", Number(event.target.value))} className="min-h-11 w-full rounded-lg border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-forest" /><span className="text-sm text-slate-500">hours</span></div></label><label className="block"><span className="mb-1.5 block text-sm font-semibold">Study days per week</span><select value={form.daysPerWeek} onChange={(event) => update("daysPerWeek", Number(event.target.value))} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-forest">{[3, 4, 5, 6, 7].map((days) => <option key={days} value={days}>{days} days</option>)}</select></label></div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <button type="submit" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-forest px-5 text-sm font-semibold text-white transition hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"><Icon name="sparkles" className="size-4" />{plan ? "Re-analyze and update plan" : "Analyze my goal & build roadmap"}</button>
      </form>

      <section aria-live="polite" className="min-w-0">
        {!plan ? <div className="rounded-2xl border border-dashed border-ink/15 bg-white p-8 text-center sm:p-12"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e4f0dc] text-forest"><Icon name="sparkles" className="size-7" /></span><h2 className="mt-4 font-display text-xl font-semibold">Your career plan will appear here</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">For SOC Analyst, we’ll map foundations, alert triage, SIEM queries, incident investigations, threat hunting, and portfolio work into your available study time.</p><a href={refs.microsoftCareer.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm font-semibold text-forest underline underline-offset-2">See the role reference</a></div>
          : <div className="space-y-5">
            <div className="rounded-2xl bg-forest p-5 text-white sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-lime">Role analysis · {plan.form.role}</p><h2 className="mt-2 font-display text-2xl font-semibold">From learning to alert-ready</h2><p className="mt-2 text-sm leading-6 text-white/80">SOC analysts monitor and investigate alerts, respond to incidents, and hunt for threats. This roadmap follows those work outcomes and adapts the workload to your inputs.</p></div><button type="button" onClick={() => setPlan(null)} className="rounded-lg border border-white/25 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10">Reset</button></div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3"><div className="rounded-xl bg-white/10 p-3"><span className="block text-2xl font-semibold">{weeks.length}</span><span className="text-xs text-white/75">weeks estimated</span></div><div className="rounded-xl bg-white/10 p-3"><span className="block text-2xl font-semibold">{formatTime(Math.round(plan.form.hoursPerDay * 60))}</span><span className="text-xs text-white/75">per study day</span></div><div className="col-span-2 rounded-xl bg-white/10 p-3 sm:col-span-1"><span className="block text-2xl font-semibold">~{totalHours}h</span><span className="text-xs text-white/75">estimated study effort</span></div></div>
              <div className="mt-5"><div className="mb-1.5 flex justify-between text-xs text-white/80"><span>Progress</span><span>{completed}/{plan.tasks.length} study blocks · {progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-lime transition-all" style={{ width: `${progress}%` }} /></div></div>
              <p className="mt-4 text-xs leading-5 text-white/70">Estimate uses your comfortable skills, {plan.form.hoursPerDay} study hours/day, and {plan.form.daysPerWeek} study days/week. This is a planning estimate, not a job guarantee; adjust as your practice shows what needs more time.</p>
            </div>
            <article className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm"><h3 className="font-display text-lg font-semibold">What we tailored from your answers</h3><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700"><li><strong>Known skills:</strong> {plan.form.knownSkills.length ? `${plan.form.knownSkills.length} selected foundation(s) shortened; practical checks remain.` : "No prior skills selected, so the plan starts with IT and security foundations."}</li><li><strong>Interests:</strong> {plan.form.interests.map((id) => interestOptions.find((item) => item.id === id)?.label).filter(Boolean).join(", ") || "Core SOC operations"}; the capstone focuses on that area.</li><li><strong>Tool practice:</strong> {plan.form.platform}; we keep the first SIEM focus to one platform to build depth.</li></ul></article>
            <article className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm"><h3 className="font-display text-lg font-semibold">Why these stages?</h3><ol className="mt-3 space-y-3">{phases.map((phase) => <li key={phase.id} className="border-l-2 border-[#c6d8a4] pl-3"><h4 className="text-sm font-semibold text-ink">{phase.title}</h4><p className="mt-1 text-xs leading-5 text-slate-600">{phase.description}</p></li>)}</ol></article>
            {weeks.map((week) => { const days = Array.from(new Set(week.tasks.map((task) => task.dayNumber))); return <article key={week.number} className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-ink/8 bg-[#f4f6ef] px-4 py-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-800">Week {week.number}</p><h3 className="mt-0.5 font-display font-semibold">{days.length} study day{days.length === 1 ? "" : "s"} · {week.tasks.reduce((sum, task) => sum + task.minutes, 0)} min</h3></div><span className="text-xs font-semibold text-slate-600">{week.tasks.filter((task) => task.done).length}/{week.tasks.length} blocks done</span></div><ol className="divide-y divide-ink/8">{week.tasks.map((task) => <li key={task.id} className="flex gap-3 px-4 py-4"><input type="checkbox" checked={task.done} onChange={() => toggle(task.id)} aria-label={`${task.done ? "Mark incomplete" : "Mark complete"}: ${task.title}`} className="mt-1 size-4 accent-emerald-800" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase tracking-wide text-emerald-800">Study day {task.dayInWeek}</span><span className="text-xs text-slate-500">{formatTime(task.minutes)}</span><span className="text-xs text-slate-400">{task.phase}</span></div><p className={`mt-1 text-sm font-semibold ${task.done ? "text-slate-500 line-through" : "text-ink"}`}>{task.title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{task.detail}</p></div></li>)}</ol></article>; })}
            <article className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm"><h3 className="font-display text-lg font-semibold">Roadmap references</h3><p className="mt-1 text-xs leading-5 text-slate-600">These are the sources used to shape the work areas and practice links in your plan.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{Array.from(new Map(phases.flatMap((phase) => phase.references).map((resource) => [resource.url, resource])).values()).map((resource) => <a key={resource.url} href={resource.url} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-ink/10 px-3 py-2 text-xs font-semibold text-forest hover:bg-paper"><span>{resource.label}</span><Icon name="arrow-up-right" className="size-4 shrink-0" /></a>)}</div><p className="mt-3 text-xs leading-5 text-slate-500">The study-hour estimate is SkillSwap’s planning estimate. References guide the skill sequence; actual hiring requirements vary by employer and region.</p></article>
            <p className="px-1 text-xs leading-5 text-slate-500">Your plan and checked study blocks are saved in this browser on this device.</p>
          </div>}
      </section>
    </div>
  </WorkspaceShell>;
}
