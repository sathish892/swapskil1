import { useEffect, useState, type FormEvent } from "react";
import type { PublicUser } from "../auth/types";
import { experienceLevels, languages, readApi, skillCategories, type FieldErrors, type SkillEntry } from "./types";
import { WorkspaceInput, WorkspaceSelect, WorkspaceShell } from "./WorkspaceShell";

type FormValues = { name: string; category: string; experienceLevel: string; instructionLanguage: string; description: string };
type SkillPayload = { skill: SkillEntry };
type SkillsPayload = { skills: SkillEntry[] };
const blank: FormValues = { name: "", category: "", experienceLevel: "", instructionLanguage: "English", description: "" };

function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.name.trim()) errors.name = "Enter a skill name.";
  else if (Array.from(values.name.trim()).length > 80) errors.name = "Use 80 characters or fewer.";
  if (!skillCategories.includes(values.category)) errors.category = "Choose a category from the list.";
  if (!experienceLevels.includes(values.experienceLevel as (typeof experienceLevels)[number])) errors.experienceLevel = "Choose your level.";
  if (!languages.includes(values.instructionLanguage as (typeof languages)[number])) errors.instructionLanguage = "Choose the language for this skill.";
  if (!values.description.trim()) errors.description = "Add a short description.";
  else if (Array.from(values.description.trim()).length > 300) errors.description = "Use 300 characters or fewer.";
  return errors;
}

function SkillForm({ kind, title, description, buttonLabel, values, onChange, onSubmit, submitting, editing, onCancel, errors }: {
  kind: "teach" | "learn"; title: string; description: string; buttonLabel: string;
  values: FormValues; onChange: (field: keyof FormValues, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; submitting: boolean; editing: boolean;
  onCancel: () => void; errors: FieldErrors;
}) {
  const prefix = kind === "teach" ? "teach" : "learn";
  return <form onSubmit={onSubmit} noValidate aria-label={title} className="rounded-3xl border border-ink/10 bg-white p-5 shadow-sm sm:p-7">
    <div className="mb-6">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">{kind === "teach" ? "Share what you know" : "Explore what’s next"}</p>
      <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.04em] text-ink">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </div>
    <div className="space-y-4">
      <WorkspaceInput id={`${prefix}-name`} label="Skill name" value={values.name} onChange={(value) => onChange("name", value)} error={errors.name} maxLength={80} placeholder={kind === "teach" ? "For example, Python basics" : "For example, public speaking"} required />
      <WorkspaceSelect id={`${prefix}-category`} label="Category" value={values.category} options={skillCategories} onChange={(value) => onChange("category", value)} error={errors.category} />
      <WorkspaceSelect id={`${prefix}-level`} label={kind === "teach" ? "Experience level" : "Current knowledge level"} value={values.experienceLevel} options={experienceLevels} onChange={(value) => onChange("experienceLevel", value)} error={errors.experienceLevel} />
      <WorkspaceSelect id={`${prefix}-language`} label={kind === "teach" ? "Language you can teach in" : "Language you want to learn in"} value={values.instructionLanguage} options={languages} onChange={(value) => onChange("instructionLanguage", value)} error={errors.instructionLanguage} />
      <WorkspaceInput id={`${prefix}-description`} label={kind === "teach" ? "Short description" : "Learning goals or short description"} value={values.description} onChange={(value) => onChange("description", value)} error={errors.description} maxLength={300} placeholder={kind === "teach" ? "What could someone learn from you?" : "What would you like to be able to do?"} required multiline />
    </div>
    <div className="mt-6 flex flex-col-reverse gap-3 border-t border-ink/8 pt-5 sm:flex-row sm:justify-end">
      {editing && <button type="button" onClick={onCancel} disabled={submitting} className="min-h-11 rounded-full border border-ink/15 px-5 text-sm font-semibold text-ink transition hover:bg-paper focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-60">Cancel edit</button>}
      <button type="submit" disabled={submitting} className="min-h-11 rounded-full bg-forest px-5 text-sm font-semibold text-white transition hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-wait disabled:opacity-60">{submitting ? "Saving…" : editing ? "Save changes" : buttonLabel}</button>
    </div>
  </form>;
}

function SkillList({ kind, items, onEdit, onDelete, deletingId }: {
  kind: "teach" | "learn"; items: SkillEntry[]; onEdit: (item: SkillEntry) => void;
  onDelete: (id: string) => void; deletingId: string;
}) {
  const title = kind === "teach" ? "Skills I can teach" : "Skills I want to learn";
  return <section aria-labelledby={`${kind}-list-title`} className="rounded-3xl border border-ink/10 bg-white p-5 shadow-sm sm:p-7">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">{kind === "teach" ? "Offer" : "Discover"}</p><h2 id={`${kind}-list-title`} className="mt-2 font-display text-2xl font-semibold tracking-[-0.04em] text-ink">{title}</h2></div>
      <span className="rounded-full bg-paper px-3 py-1.5 text-xs font-semibold text-slate-600">{items.length}</span>
    </div>
    {items.length === 0 ? <p className="mt-5 rounded-2xl border border-dashed border-ink/15 bg-paper/70 p-5 text-sm leading-6 text-slate-600">{kind === "teach" ? "No teaching skills added yet. Add one above when you’re ready to share." : "No learning goals added yet. Add one above to keep track of what you want to explore."}</p> : <ul className="mt-5 space-y-3">
      {items.map((item) => <li key={item.id} className="rounded-2xl border border-ink/8 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="break-words font-display text-lg font-semibold text-ink">{item.name}</h3>
            <div className="mt-2 flex flex-wrap gap-2"><span className="rounded-full bg-[#e4f0dc] px-3 py-1 text-xs font-semibold text-forest">{item.category}</span><span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-slate-600">{item.experienceLevel}</span><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">In {item.instructionLanguage}</span></div>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{item.description}</p>
          </div>
          <div className="flex shrink-0 gap-2 sm:justify-end">
            <button type="button" onClick={() => onEdit(item)} className="min-h-10 rounded-full border border-ink/15 px-4 text-xs font-semibold text-ink transition hover:bg-paper focus-visible:outline-2 focus-visible:outline-emerald-700">Edit</button>
            <button type="button" onClick={() => onDelete(item.id)} disabled={deletingId === item.id} className="min-h-10 rounded-full border border-red-200 px-4 text-xs font-semibold text-red-800 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-700 disabled:opacity-60">{deletingId === item.id ? "Removing…" : "Delete"}</button>
          </div>
        </div>
      </li>)}
    </ul>}
  </section>;
}

export function MySkillsPage({ user, onLogout, loggingOut, logoutError }: {
  user: PublicUser; onLogout: () => void; loggingOut: boolean; logoutError: string;
}) {
  const [teachSkills, setTeachSkills] = useState<SkillEntry[]>([]);
  const [learnSkills, setLearnSkills] = useState<SkillEntry[]>([]);
  const [teachForm, setTeachForm] = useState<FormValues>(blank);
  const [learnForm, setLearnForm] = useState<FormValues>(blank);
  const [teachErrors, setTeachErrors] = useState<FieldErrors>({});
  const [learnErrors, setLearnErrors] = useState<FieldErrors>({});
  const [teachEditId, setTeachEditId] = useState("");
  const [learnEditId, setLearnEditId] = useState("");
  const [teachBusy, setTeachBusy] = useState(false);
  const [learnBusy, setLearnBusy] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [teachMessage, setTeachMessage] = useState("");
  const [learnMessage, setLearnMessage] = useState("");
  const [teachError, setTeachError] = useState("");
  const [learnError, setLearnError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/skills", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        const payload = await readApi<SkillsPayload>(response);
        if (!response.ok || !payload.skills) throw new Error(payload.error || "Couldn’t load your skills.");
        setTeachSkills(payload.skills.filter((skill) => skill.kind === "teach"));
        setLearnSkills(payload.skills.filter((skill) => skill.kind === "learn"));
      })
      .catch((error: unknown) => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Couldn’t load your skills."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const updateForm = (kind: "teach" | "learn", field: keyof FormValues, value: string) => {
    if (kind === "teach") { setTeachForm((form) => ({ ...form, [field]: value })); setTeachErrors((errors) => ({ ...errors, [field]: "" })); setTeachMessage(""); setTeachError(""); }
    else { setLearnForm((form) => ({ ...form, [field]: value })); setLearnErrors((errors) => ({ ...errors, [field]: "" })); setLearnMessage(""); setLearnError(""); }
  };

  const submit = async (kind: "teach" | "learn", event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const isTeach = kind === "teach";
    const form = isTeach ? teachForm : learnForm;
    const editId = isTeach ? teachEditId : learnEditId;
    const issues = validate(form);
    if (isTeach) { setTeachErrors(issues); setTeachMessage(""); setTeachError(""); }
    else { setLearnErrors(issues); setLearnMessage(""); setLearnError(""); }
    if (Object.keys(issues).length) return;
    const setBusy = isTeach ? setTeachBusy : setLearnBusy;
    setBusy(true);
    try {
      const response = await fetch(editId ? `/api/skills/${encodeURIComponent(editId)}` : `/api/skills/${kind}`, {
        method: editId ? "PUT" : "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, name: form.name.trim(), description: form.description.trim() }),
      });
      const payload = await readApi<SkillPayload>(response);
      if (!response.ok || !payload.skill) {
        if (isTeach) setTeachErrors(payload.errors ?? {}); else setLearnErrors(payload.errors ?? {});
        throw new Error(payload.error || "Couldn’t save this entry.");
      }
      if (isTeach) {
        setTeachSkills((items) => editId ? items.map((item) => item.id === editId ? payload.skill : item) : [payload.skill, ...items]);
        setTeachForm(blank); setTeachEditId(""); setTeachMessage(editId ? "Teaching skill updated." : "Teaching skill added.");
      } else {
        setLearnSkills((items) => editId ? items.map((item) => item.id === editId ? payload.skill : item) : [payload.skill, ...items]);
        setLearnForm(blank); setLearnEditId(""); setLearnMessage(editId ? "Learning goal updated." : "Learning goal added.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn’t save this entry.";
      if (isTeach) setTeachError(message); else setLearnError(message);
    } finally { setBusy(false); }
  };

  const edit = (item: SkillEntry) => {
    const values = { name: item.name, category: item.category, experienceLevel: item.experienceLevel, instructionLanguage: item.instructionLanguage || "English", description: item.description };
    if (item.kind === "teach") { setTeachForm(values); setTeachEditId(item.id); setTeachErrors({}); setTeachMessage(""); setTeachError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }
    else { setLearnForm(values); setLearnEditId(item.id); setLearnErrors({}); setLearnMessage(""); setLearnError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }
  };

  const cancelEdit = (kind: "teach" | "learn") => {
    if (kind === "teach") { setTeachForm(blank); setTeachEditId(""); setTeachErrors({}); setTeachError(""); }
    else { setLearnForm(blank); setLearnEditId(""); setLearnErrors({}); setLearnError(""); }
  };

  const remove = async (id: string, kind: "teach" | "learn") => {
    setDeletingId(id);
    if (kind === "teach") { setTeachError(""); setTeachMessage(""); } else { setLearnError(""); setLearnMessage(""); }
    try {
      const response = await fetch(`/api/skills/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) { const payload = await readApi<{ error?: string }>(response); throw new Error(payload.error || "Couldn’t remove this entry."); }
      if (kind === "teach") { setTeachSkills((items) => items.filter((item) => item.id !== id)); setTeachMessage("Teaching skill removed."); }
      else { setLearnSkills((items) => items.filter((item) => item.id !== id)); setLearnMessage("Learning goal removed."); }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn’t remove this entry.";
      if (kind === "teach") setTeachError(message); else setLearnError(message);
    } finally { setDeletingId(""); }
  };

  return <WorkspaceShell user={user} title="My skills" eyebrow="Exchange starts here" description="Keep the skills you can share and the things you want to learn in separate lists." onLogout={onLogout} loggingOut={loggingOut} logoutError={logoutError}>
    {loading ? <p role="status" className="rounded-3xl border border-ink/10 bg-white p-7 text-sm text-slate-600">Loading your skills…</p> : loadError ? <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">{loadError}</p> : <>
      <div className="mb-6 grid gap-5 lg:grid-cols-2">
        <div>{teachError && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{teachError}</p>}{teachMessage && <p role="status" className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{teachMessage}</p>}<SkillForm kind="teach" title="Skills I can teach" description="Share what you know and the experience you can bring to a peer exchange." buttonLabel="Add skill" values={teachForm} onChange={(field, value) => updateForm("teach", field, value)} onSubmit={(event) => void submit("teach", event)} submitting={teachBusy} editing={Boolean(teachEditId)} onCancel={() => cancelEdit("teach")} errors={teachErrors} /></div>
        <div>{learnError && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{learnError}</p>}{learnMessage && <p role="status" className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{learnMessage}</p>}<SkillForm kind="learn" title="Skills I want to learn" description="Set a learning goal and describe what you hope to practice." buttonLabel="Add learning goal" values={learnForm} onChange={(field, value) => updateForm("learn", field, value)} onSubmit={(event) => void submit("learn", event)} submitting={learnBusy} editing={Boolean(learnEditId)} onCancel={() => cancelEdit("learn")} errors={learnErrors} /></div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <SkillList kind="teach" items={teachSkills} onEdit={edit} onDelete={(id) => void remove(id, "teach")} deletingId={deletingId} />
        <SkillList kind="learn" items={learnSkills} onEdit={edit} onDelete={(id) => void remove(id, "learn")} deletingId={deletingId} />
      </div>
    </>}
  </WorkspaceShell>;
}
