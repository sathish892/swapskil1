import { useCallback, useEffect, useState } from "react";
import type { PublicUser } from "../auth/types";
import { WorkspaceShell } from "./WorkspaceShell";
import { readApi } from "./types";

type Session = { id: string; skillName: string; status: "scheduled" | "completed"; meetingStatus: string; scheduledAt: string | null; cancelledAt: string | null; role: "teacher" | "learner"; createdAt: string; completedAt: string | null; youConfirmedCompletion: boolean; otherConfirmedCompletion: boolean; otherParticipant: { id: string; fullName: string } };
type TeachSkill = { id: string; kind: string; name: string };
type PendingReview = { sessionId: string; skillName: string; completedAt: string; ratingType: "teacher" | "learner"; recipient: { id: string; fullName: string } };

export function SessionsPage({ user, onLogout, loggingOut, logoutError }: { user: PublicUser; onLogout: () => void; loggingOut: boolean; logoutError: string }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [stars, setStars] = useState<Record<string, number>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [teachSkills, setTeachSkills] = useState<TeachSkill[]>([]);
  const [roomSkillId, setRoomSkillId] = useState("");
  const [roomTitle, setRoomTitle] = useState("");
  const [roomDuration, setRoomDuration] = useState("120");
  const [creatingRoom, setCreatingRoom] = useState(false);

  const load = useCallback(async () => {
    const [sessionsResponse, pendingResponse] = await Promise.all([
      fetch("/api/learning-sessions", { credentials: "include" }),
      fetch("/api/reviews/pending", { credentials: "include" }),
    ]);
    const sessionData = await readApi<{ sessions?: Session[] }>(sessionsResponse);
    const pendingData = await readApi<{ reviews?: PendingReview[] }>(pendingResponse);
    if (!sessionsResponse.ok || !pendingResponse.ok) throw new Error(sessionData.error || pendingData.error || "Couldn’t load your sessions.");
    setSessions(sessionData.sessions || []); setPending(pendingData.reviews || []);
  }, []);

  useEffect(() => { void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Couldn’t load your sessions.")).finally(() => setLoading(false)); }, [load]);
  useEffect(() => {
    void fetch("/api/skills", { credentials: "include" }).then((response) => readApi<{ skills?: TeachSkill[] }>(response)).then((payload) => setTeachSkills((payload.skills || []).filter((skill) => skill.kind === "teach"))).catch(() => {});
  }, []);

  const createRoom = async (event: React.FormEvent) => {
    event.preventDefault(); setCreatingRoom(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/open-learning-rooms", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skillId: roomSkillId, title: roomTitle, durationMinutes: Number(roomDuration) }) });
      const payload = await readApi<{ room?: { id: string }; error?: string }>(response);
      if (!response.ok || !payload.room) throw new Error(payload.error || "Couldn’t create the learning room.");
      window.location.assign("/learning-rooms/open-" + encodeURIComponent(payload.room.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t create the learning room."); setCreatingRoom(false); }
  };

  const confirm = async (session: Session) => {
    setBusy(session.id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/learning-sessions/" + encodeURIComponent(session.id) + "/confirm-completion", { method: "POST", credentials: "include" });
      const result = await readApi<{ session?: { status: string }; error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Couldn’t confirm completion.");
      await load();
      setMessage(result.session?.status === "completed" ? "Both participants confirmed completion. Reviews are now available." : "Your confirmation was saved. Reviews will be available after the other participant confirms.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t confirm completion."); }
    finally { setBusy(""); }
  };

  const submit = async (review: PendingReview) => {
    setBusy(review.sessionId); setError(""); setMessage("");
    if (!stars[review.sessionId]) { setError("Choose a star rating from 1 to 5."); setBusy(""); return; }
    try {
      const response = await fetch("/api/reviews", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: review.sessionId, stars: stars[review.sessionId], reviewText: texts[review.sessionId] || "" }) });
      const result = await readApi<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Couldn’t submit your review.");
      await load(); setMessage("Your review was submitted. Thank you for sharing your experience.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t submit your review."); }
    finally { setBusy(""); }
  };

  return <WorkspaceShell user={user} title="Learning sessions" eyebrow="Learn together" description="Confirm completed exchanges and share a review with the student you learned with." onLogout={onLogout} loggingOut={loggingOut} logoutError={logoutError}>
    {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</p>}
    {loading ? <p role="status" className="rounded-2xl border border-ink/10 bg-white p-6 text-sm text-slate-600">Loading sessions…</p> : <>
      <section aria-labelledby="create-room-title" className="mb-9 rounded-3xl border border-emerald-900/10 bg-[#eaf1e5] p-5 sm:p-7">
        <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Start teaching</p><h2 id="create-room-title" className="mt-2 font-display text-2xl font-semibold text-ink">Create a live learning room</h2><p className="mt-2 text-sm leading-6 text-slate-600">Choose a skill you teach and create the room. Learners can find it in Online Learning and join directly.</p></div>
        {teachSkills.length === 0 ? <p className="mt-4 text-sm text-slate-700">Add a skill you can teach first. <a href="/my-skills" className="font-semibold text-forest underline underline-offset-2">Go to My Skills</a></p> : <form onSubmit={(event) => void createRoom(event)} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_180px_auto] lg:items-end">
          <label className="text-sm font-semibold">What will you teach?<select required value={roomSkillId} onChange={(event) => setRoomSkillId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 font-normal"><option value="">Select a skill</option>{teachSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
          <label className="text-sm font-semibold">Room name <span className="font-normal text-slate-500">(optional)</span><input value={roomTitle} maxLength={120} onChange={(event) => setRoomTitle(event.target.value)} placeholder="Uses the skill name by default" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 font-normal" /></label>
          <label className="text-sm font-semibold">Room length<select value={roomDuration} onChange={(event) => setRoomDuration(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 font-normal"><option value="60">60 minutes</option><option value="120">2 hours</option><option value="180">3 hours</option><option value="240">4 hours</option></select></label>
          <button type="submit" disabled={creatingRoom || !roomSkillId} className="min-h-11 rounded-full bg-forest px-5 text-sm font-semibold text-white hover:bg-emerald-950 disabled:opacity-60">{creatingRoom ? "Creating…" : "Create session"}</button>
        </form>}
      </section>
      <section aria-labelledby="sessions-title" className="space-y-4">
        <h2 id="sessions-title" className="font-display text-2xl font-semibold text-ink">Your sessions</h2>
        {sessions.length === 0 ? <p className="rounded-2xl border border-dashed border-ink/15 bg-white p-6 text-sm text-slate-600">No learning sessions yet. Accepted exchange requests will appear here.</p> : sessions.map((session) => <article key={session.id} className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-emerald-800">You were the {session.role}</p><h3 className="mt-1 font-display text-xl font-semibold text-ink">{session.skillName}</h3><p className="mt-1 text-sm text-slate-600">Learning with <a className="font-semibold text-forest underline underline-offset-2" href={"/students/" + encodeURIComponent(session.otherParticipant.id)}>{session.otherParticipant.fullName}</a></p>{session.scheduledAt && <a href="/learning-rooms" className="mt-2 inline-flex text-sm font-semibold text-forest underline underline-offset-2">View online session schedule</a>}</div><span className="w-fit rounded-full bg-paper px-3 py-1.5 text-xs font-semibold capitalize text-slate-700">{session.cancelledAt ? "Cancelled" : session.status === "completed" ? "Completed" : session.meetingStatus === "unscheduled" ? "Awaiting schedule" : session.meetingStatus}</span></div>
          {session.status === "scheduled" && !session.cancelledAt && <div className="mt-5 border-t border-ink/8 pt-4">{session.youConfirmedCompletion ? <p className="text-sm text-slate-600">Your confirmation is saved. Waiting for the other participant.</p> : <button type="button" onClick={() => void confirm(session)} disabled={busy === session.id} className="min-h-11 rounded-full bg-forest px-5 text-sm font-semibold text-white transition hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-60">{busy === session.id ? "Saving…" : "Confirm session completed"}</button>}</div>}
        </article>)}
      </section>
      <section aria-labelledby="reviews-title" className="mt-10 space-y-4">
        <div><h2 id="reviews-title" className="font-display text-2xl font-semibold text-ink">Reviews to write</h2><p className="mt-1 text-sm text-slate-600">Only completed sessions appear here. Your role determines which review form is shown.</p></div>
        {pending.length === 0 ? <p className="rounded-2xl border border-dashed border-ink/15 bg-white p-6 text-sm text-slate-600">No reviews are waiting for you.</p> : pending.map((review) => <article key={review.sessionId} className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">{review.ratingType === "teacher" ? "Teacher review" : "Learner review"}</p>
          <h3 className="mt-1 font-display text-xl font-semibold text-ink">{review.skillName}</h3><p className="mt-1 text-sm text-slate-600">Reviewing <a href={"/students/" + encodeURIComponent(review.recipient.id)} className="font-semibold text-forest underline underline-offset-2">{review.recipient.fullName}</a> · completed {new Date(review.completedAt.replace(" ", "T") + (review.completedAt.includes("Z") ? "" : "Z")).toLocaleDateString()}</p>
          <p className="mt-4 text-sm font-medium text-slate-700">{review.ratingType === "teacher" ? "Think about teaching quality, clarity, preparation, and helpfulness." : "Think about participation, preparation, communication, and engagement."}</p>
          <fieldset className="mt-4"><legend className="mb-2 text-sm font-semibold text-ink">Your rating <span className="sr-only">from one to five stars</span></legend><div className="flex gap-2" role="radiogroup" aria-label="Rating from one to five stars">{[1, 2, 3, 4, 5].map((value) => <label key={value} className="cursor-pointer rounded-lg focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-emerald-700"><input className="peer sr-only" type="radio" name={"rating-" + review.sessionId} value={value} checked={stars[review.sessionId] === value} onChange={() => setStars((current) => ({ ...current, [review.sessionId]: value }))} aria-label={value + (value === 1 ? " star" : " stars")} /><span aria-hidden="true" className={`block text-3xl leading-none transition ${stars[review.sessionId] >= value ? "text-amber-500" : "text-slate-300"} peer-focus-visible:scale-110`}>★</span></label>)}</div></fieldset>
          <label htmlFor={"review-text-" + review.sessionId} className="mb-2 mt-4 block text-sm font-semibold text-ink">Written review <span className="font-normal text-slate-500">(optional)</span></label><textarea id={"review-text-" + review.sessionId} maxLength={1000} rows={3} value={texts[review.sessionId] || ""} onChange={(event) => setTexts((current) => ({ ...current, [review.sessionId]: event.target.value }))} placeholder="Share a helpful note about your experience." className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-900/10" />
          <button type="button" onClick={() => void submit(review)} disabled={busy === review.sessionId} className="mt-4 min-h-11 rounded-full bg-forest px-5 text-sm font-semibold text-white transition hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-60">{busy === review.sessionId ? "Submitting…" : "Submit review"}</button>
        </article>)}
      </section>
    </>}
  </WorkspaceShell>;
}
