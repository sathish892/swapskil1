import { useEffect, useState, type FormEvent } from "react";
import type { PublicUser } from "../auth/types";
import { readApi, type FieldErrors, type Profile } from "./types";
import { WorkspaceInput, WorkspaceShell } from "./WorkspaceShell";

type ProfileForm = Omit<Profile, "id" | "updatedAt" | "interests" | "avatarUrl"> & { interestsText: string };
type ProfilePayload = { profile: Profile };
const blankForm: ProfileForm = { fullName: "", bio: "", institution: "", department: "", location: "", interestsText: "", learningSkillsPublic: false };

function ProfileAvatar({ name, src }: { name: string; src?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "S";
  return src
    ? <img src={src} alt={`${name || "Student"}'s profile`} className="mx-auto size-28 rounded-full border-4 border-white object-cover shadow-lg shadow-forest/10" />
    : <div className="mx-auto grid size-28 place-items-center rounded-full border-4 border-white bg-[#e4f0dc] font-display text-3xl font-semibold text-forest shadow-lg shadow-forest/10" aria-label={`Avatar for ${name || "student"}`} role="img">{initials}</div>;
}

function formFromProfile(profile: Profile): ProfileForm {
  return { fullName: profile.fullName, bio: profile.bio, institution: profile.institution, department: profile.department, location: profile.location, interestsText: profile.interests.join(", "), learningSkillsPublic: profile.learningSkillsPublic };
}

function validate(form: ProfileForm): FieldErrors {
  const errors: FieldErrors = {};
  const interests = form.interestsText.split(",").map((item) => item.trim()).filter(Boolean);
  if (!form.fullName.trim()) errors.fullName = "Enter your full name.";
  else if (Array.from(form.fullName.trim()).length > 100) errors.fullName = "Use 100 characters or fewer.";
  if (Array.from(form.bio.trim()).length > 500) errors.bio = "Use 500 characters or fewer.";
  if (Array.from(form.institution.trim()).length > 150) errors.institution = "Use 150 characters or fewer.";
  if (Array.from(form.department.trim()).length > 100) errors.department = "Use 100 characters or fewer.";
  if (Array.from(form.location.trim()).length > 100) errors.location = "Use 100 characters or fewer.";
  if (interests.length > 12 || interests.some((item) => Array.from(item).length > 40)) errors.interests = "Add up to 12 interests, each 1–40 characters long.";
  if (new Set(interests.map((item) => item.toLowerCase())).size !== interests.length) errors.interests = "Remove duplicate interests.";
  return errors;
}

export function ProfilePage({ user, onLogout, loggingOut, logoutError }: {
  user: PublicUser; onLogout: () => void; loggingOut: boolean; logoutError: string;
}) {
  const [savedProfile, setSavedProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<ProfileForm>(blankForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [editing, setEditing] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/profile", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        const payload = await readApi<ProfilePayload>(response);
        if (!response.ok || !payload.profile) throw new Error(payload.error || "Couldn’t load your profile.");
        setSavedProfile(payload.profile);
        setForm(formFromProfile(payload.profile));
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Couldn’t load your profile.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const avatarUrl = savedProfile?.avatarUrl || "";
  const update = (field: Exclude<keyof ProfileForm, "learningSkillsPublic">, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setSuccess("");
  };
  const cancel = () => {
    setForm(savedProfile ? formFromProfile(savedProfile) : blankForm);
    setErrors({}); setFormError(""); setSuccess(""); setEditing(false);
  };

  const uploadPhoto = async (file?: File) => {
    if (!file) return;
    setPhotoError(""); setSuccess("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setPhotoError("Choose a PNG, JPEG, or WebP photo."); return; }
    if (file.size > 2 * 1024 * 1024) { setPhotoError("Choose a photo under 2 MB."); return; }
    setPhotoBusy(true);
    try {
      const body = new FormData(); body.append("photo", file);
      const response = await fetch("/api/profile/avatar", { method: "POST", credentials: "include", body });
      const payload = await readApi<{ avatarUrl?: string }>(response);
      if (!response.ok || !payload.avatarUrl) throw new Error(payload.error || "Couldn’t upload your photo.");
      setSavedProfile((current) => current ? { ...current, avatarUrl: payload.avatarUrl! } : current);
      setSuccess("Your profile photo has been updated.");
    } catch (error) { setPhotoError(error instanceof Error ? error.message : "Couldn’t upload your photo."); }
    finally { setPhotoBusy(false); }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clientErrors = validate(form);
    setErrors(clientErrors); setFormError(""); setSuccess("");
    if (Object.keys(clientErrors).length) return;
    setSaving(true);
    try {
      const interests = form.interestsText.split(",").map((item) => item.trim()).filter(Boolean);
      const response = await fetch("/api/profile", {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: form.fullName.trim(), bio: form.bio, institution: form.institution, department: form.department, location: form.location, interests, learningSkillsPublic: form.learningSkillsPublic }),
      });
      const payload = await readApi<ProfilePayload>(response);
      if (!response.ok || !payload.profile) {
        setErrors(payload.errors ?? {});
        throw new Error(payload.error || "Couldn’t save your changes.");
      }
      setSavedProfile(payload.profile); setForm(formFromProfile(payload.profile)); setSuccess("Your profile has been saved."); setEditing(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Couldn’t save your changes.");
    } finally { setSaving(false); }
  };

  return <WorkspaceShell user={user} title="Your profile" eyebrow="A little about you" description="Share the details that help other students get to know you. Your email and account settings stay private." onLogout={onLogout} loggingOut={loggingOut} logoutError={logoutError}>
    {loading ? <div role="status" className="rounded-3xl border border-ink/10 bg-white p-8 text-sm text-slate-600">Loading your profile…</div> : loadError ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">{loadError}</div> : <>
      {formError && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{formError}</p>}
      {success && <p role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">{success}</p>}
      {!editing ? <section className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
        <aside className="rounded-3xl border border-ink/10 bg-white p-6 shadow-sm sm:p-8">
          <ProfileAvatar name={form.fullName || user.fullName} src={avatarUrl} />
          <label htmlFor="profile-photo-upload" className="mx-auto mt-4 flex min-h-10 w-fit cursor-pointer items-center rounded-full border border-ink/15 px-4 text-sm font-semibold text-forest transition hover:bg-paper focus-within:outline-2 focus-within:outline-emerald-700">{photoBusy ? "Uploading…" : avatarUrl ? "Change photo" : "Add a profile photo"}<input id="profile-photo-upload" type="file" accept="image/png,image/jpeg,image/webp" disabled={photoBusy} onChange={(event) => { void uploadPhoto(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} className="sr-only" /></label>
          {photoError && <p role="alert" className="mt-2 text-center text-xs text-red-700">{photoError}</p>}
          <h2 className="mt-5 text-center font-display text-2xl font-semibold text-ink">{form.fullName || user.fullName}</h2>
          <p className="mt-2 text-center text-sm text-slate-500">{form.department || "SkillSwap learner"}{form.institution ? ` · ${form.institution}` : ""}</p>
          <button type="button" onClick={() => { setEditing(true); setSuccess(""); }} className="mt-6 min-h-11 w-full rounded-full bg-forest px-5 text-sm font-semibold text-white transition hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Edit profile</button>
        </aside>
        <div className="rounded-3xl border border-ink/10 bg-white p-5 shadow-sm sm:p-8">
          <h2 className="font-display text-xl font-semibold text-ink">About me</h2>
          {!form.bio && !form.institution && !form.department && !form.location && !form.interestsText ? <div className="mt-5 rounded-2xl border border-dashed border-ink/15 bg-paper/70 p-5"><p className="text-sm leading-6 text-slate-600">Your profile is ready for a few details. Add a short bio and interests to help other students get to know you.</p><button type="button" onClick={() => setEditing(true)} className="mt-4 min-h-10 rounded-full border border-forest px-4 text-sm font-semibold text-forest transition hover:bg-white focus-visible:outline-2 focus-visible:outline-emerald-700">Complete profile</button></div> : <>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-600">{form.bio || "No bio added yet."}</p>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              {[["Institution", form.institution], ["Field of study", form.department], ["Location", form.location]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt className="text-xs font-bold uppercase tracking-[0.13em] text-slate-500">{label}</dt><dd className="mt-1.5 break-words text-sm font-medium text-ink">{value}</dd></div>)}
            </dl>
            {form.interestsText && <div className="mt-6"><h3 className="text-xs font-bold uppercase tracking-[0.13em] text-slate-500">Interests</h3><div className="mt-3 flex flex-wrap gap-2">{form.interestsText.split(",").filter(Boolean).map((interest) => <span key={interest} className="rounded-full bg-[#e4f0dc] px-3 py-1.5 text-xs font-semibold text-forest">{interest.trim()}</span>)}</div></div>}
          </>}
        </div>
      </section> : <form onSubmit={save} noValidate className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
        <aside className="rounded-3xl border border-ink/10 bg-white p-6 shadow-sm sm:p-8">
          <ProfileAvatar name={form.fullName || user.fullName} src={avatarUrl} />
          <label htmlFor="profile-photo-upload" className="mx-auto mt-4 flex min-h-10 w-fit cursor-pointer items-center rounded-full border border-ink/15 px-4 text-sm font-semibold text-forest transition hover:bg-paper focus-within:outline-2 focus-within:outline-emerald-700">{photoBusy ? "Uploading…" : avatarUrl ? "Change photo" : "Add a profile photo"}<input id="profile-photo-upload" type="file" accept="image/png,image/jpeg,image/webp" disabled={photoBusy} onChange={(event) => { void uploadPhoto(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} className="sr-only" /></label>
          {photoError && <p role="alert" className="mt-2 text-center text-xs text-red-700">{photoError}</p>}
          <p className="mt-5 text-center font-display text-xl font-semibold text-ink">{form.fullName || "Your name"}</p>
          <p className="mt-2 text-center text-sm leading-6 text-slate-500">Add a clear photo so other students can recognize you. PNG, JPEG, or WebP under 2 MB.</p>
          <div className="mt-7 rounded-2xl bg-paper p-4 text-sm text-slate-600">
            <p className="font-semibold text-ink">Profile checklist</p>
            <p className="mt-2 leading-6">Add a short bio and a few interests so other students know what you enjoy.</p>
          </div>
        </aside>
        <section className="rounded-3xl border border-ink/10 bg-white p-5 shadow-sm sm:p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2"><WorkspaceInput id="profile-full-name" label="Full name" value={form.fullName} onChange={(value) => update("fullName", value)} error={errors.fullName} maxLength={100} required /></div>
            <div className="sm:col-span-2"><WorkspaceInput id="profile-bio" label="Short bio" value={form.bio} onChange={(value) => update("bio", value)} error={errors.bio} maxLength={500} placeholder="A little about what you enjoy learning or sharing" multiline /></div>
            <WorkspaceInput id="profile-institution" label="College or institution (optional)" value={form.institution} onChange={(value) => update("institution", value)} error={errors.institution} maxLength={150} placeholder="Your school or institution" />
            <WorkspaceInput id="profile-department" label="Department or field (optional)" value={form.department} onChange={(value) => update("department", value)} error={errors.department} maxLength={100} placeholder="For example, computer science" />
            <WorkspaceInput id="profile-location" label="Location (optional)" value={form.location} onChange={(value) => update("location", value)} error={errors.location} maxLength={100} placeholder="City or region" />
            <WorkspaceInput id="profile-interests" label="Interests" value={form.interestsText} onChange={(value) => update("interestsText", value)} error={errors.interests} maxLength={500} placeholder="Separate interests with commas" />
            <label className="sm:col-span-2 flex cursor-pointer items-start gap-3 rounded-2xl border border-ink/10 bg-paper/70 p-4 text-sm leading-6 text-slate-700">
              <input type="checkbox" checked={form.learningSkillsPublic} onChange={(event) => setForm((current) => ({ ...current, learningSkillsPublic: event.target.checked }))} className="mt-1 size-4 accent-[#214a3b]" />
              <span><span className="block font-semibold text-ink">Show my learning goals on my public profile</span><span className="mt-1 block text-xs leading-5 text-slate-600">Teaching skills are public. Learning goals stay private unless you turn this on.</span></span>
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">Add up to 12 interests, separated by commas.</p>
          <div className="mt-7 flex flex-col-reverse gap-3 border-t border-ink/8 pt-6 sm:flex-row sm:justify-end">
            <button type="button" onClick={cancel} disabled={saving} className="min-h-12 rounded-full border border-ink/15 px-6 text-sm font-semibold text-ink transition hover:bg-paper focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-60">Cancel</button>
            <button type="submit" disabled={saving} className="min-h-12 rounded-full bg-forest px-6 text-sm font-semibold text-white transition hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-wait disabled:opacity-60">{saving ? "Saving…" : savedProfile ? "Save changes" : "Create profile"}</button>
          </div>
        </section>
      </form>}
    </>}
  </WorkspaceShell>;
}
