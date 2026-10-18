import { useCallback, useEffect, useState } from "react";
import type { PublicUser } from "../auth/types";
import { WorkspaceShell } from "./WorkspaceShell";
import { readApi } from "./types";

type Participant = { id: string; fullName: string; role: "teacher" | "learner" };
type EligibleLearner = { id: string; fullName: string };
type LearningSession = { id: string; exchangeRequestId: string; skillName: string; title: string; description: string; scheduledAt: string | null; durationMinutes: number; status: "scheduled" | "completed"; meetingStatus: "unscheduled" | "upcoming" | "ongoing" | "completed" | "cancelled"; cancelledAt: string | null; createdBy: string | null; role: "teacher" | "learner"; otherParticipant: { id: string; fullName: string }; participants?: Participant[]; roomType?: "open" };
type OpenRoom = { id: string; title: string; skillName: string; description: string; scheduledAt: string; durationMinutes: number; status: "open" | "ended"; createdAt: string; createdBy: string; participants: Participant[] };

function localInput(iso: string | null) { if (!iso) return ""; const date = new Date(iso); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function isoValue(local: string) { const date = new Date(local); return Number.isFinite(date.getTime()) ? date.toISOString() : ""; }
function displayDate(iso: string | null) { return iso ? new Date(iso).toLocaleString([], { dateStyle: "full", timeStyle: "short" }) : "Not scheduled"; }

function ScheduleForm({ session, busy, onSubmit, onCancel, reschedule = false }: { session: LearningSession; busy: boolean; onSubmit: (body: Record<string, unknown>) => void; onCancel: () => void; reschedule?: boolean }) {
  const [title, setTitle] = useState(reschedule ? session.title : "Skill session: " + session.skillName);
  const [description, setDescription] = useState(session.description);
  const [datetime, setDatetime] = useState(localInput(session.scheduledAt));
  const [duration, setDuration] = useState(String(session.durationMinutes || 60));
  const submit = (event: React.FormEvent) => { event.preventDefault(); onSubmit({ action: reschedule ? "reschedule" : undefined, exchangeRequestId: session.exchangeRequestId, title, skill: session.skillName, description, scheduledAt: isoValue(datetime), durationMinutes: Number(duration) }); };
  return <form onSubmit={submit} className="mt-4 grid gap-3 rounded-2xl border border-ink/8 bg-paper/60 p-4 sm:grid-cols-2">
    <label className="text-sm font-semibold">Session title<input required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 font-normal" /></label>
    <label className="text-sm font-semibold">Skill<input readOnly value={session.skillName} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-normal text-slate-600" /></label>
    <label className="text-sm font-semibold">Date and start time<input required type="datetime-local" value={datetime} onChange={(event) => setDatetime(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 font-normal" /></label>
    <label className="text-sm font-semibold">Duration<select value={duration} onChange={(event) => setDuration(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 font-normal">{[15, 30, 45, 60, 90, 120, 180, 240].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label>
    <label className="text-sm font-semibold sm:col-span-2">Description <span className="font-normal text-slate-500">(optional)</span><textarea maxLength={2000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal" /></label>
    <div className="flex gap-2 sm:col-span-2"><button disabled={busy || !datetime} className="min-h-10 rounded-full bg-forest px-5 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : reschedule ? "Save schedule" : "Create learning room"}</button><button type="button" onClick={onCancel} className="min-h-10 rounded-full border border-ink/15 px-5 text-sm font-semibold">Cancel</button></div>
  </form>;
}

export function LearningRoomsPage({ user, onLogout, loggingOut, logoutError }: { user: PublicUser; onLogout: () => void; loggingOut: boolean; logoutError: string }) {
  const [sessions, setSessions] = useState<LearningSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inviting, setInviting] = useState("");
  const [eligibleLearners, setEligibleLearners] = useState<EligibleLearner[]>([]);
  const [selectedLearners, setSelectedLearners] = useState<string[]>([]);
  const [inviteRemaining, setInviteRemaining] = useState(0);
  const load = useCallback(async () => {
    const [response, roomsResponse] = await Promise.all([
      fetch("/api/learning-sessions", { credentials: "include" }),
      fetch("/api/open-learning-rooms", { credentials: "include" }),
    ]);
    const payload = await readApi<{ sessions?: LearningSession[]; error?: string }>(response);
    const roomsPayload = await readApi<{ rooms?: OpenRoom[]; error?: string }>(roomsResponse);
    if (!response.ok || !roomsResponse.ok) throw new Error(payload.error || roomsPayload.error || "Couldn’t load learning rooms.");
    const openRooms: LearningSession[] = (roomsPayload.rooms || []).map((room) => {
      const host = room.participants.find((participant) => participant.id === room.createdBy);
      const hostIsViewer = room.createdBy === user.id;
      return {
        id: "open-" + room.id, exchangeRequestId: "", skillName: room.skillName, title: room.title,
        description: room.description, scheduledAt: room.scheduledAt, durationMinutes: room.durationMinutes,
        status: "scheduled", meetingStatus: "ongoing", cancelledAt: null, createdBy: room.createdBy,
        role: hostIsViewer ? "teacher" : "learner", otherParticipant: host || { id: room.createdBy, fullName: "Room host" },
        participants: room.participants, roomType: "open",
      };
    });
    setSessions([...(payload.sessions || []), ...openRooms]);
  }, [user.id]);
  useEffect(() => { void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Couldn’t load sessions.")).finally(() => setLoading(false)); }, [load]);

  const saveSchedule = async (session: LearningSession, body: Record<string, unknown>) => {
    setBusy(session.id); setError(""); setNotice("");
    try {
      const url = body.action ? "/api/learning-sessions/" + encodeURIComponent(session.id) : "/api/learning-sessions";
      const response = await fetch(url, { method: body.action ? "PATCH" : "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await readApi<{ error?: string; errors?: Record<string, string> }>(response);
      if (!response.ok) throw new Error(payload.error || Object.values(payload.errors || {})[0] || "Couldn’t save this learning session.");
      setEditing(""); await load(); setNotice(body.action ? "Session schedule updated." : "Learning session scheduled.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t save this learning session."); }
    finally { setBusy(""); }
  };

  const cancelSession = async (session: LearningSession) => {
    if (!window.confirm("Cancel this online learning session?")) return;
    setBusy(session.id); setError(""); setNotice("");
    try {
      const isOpenRoom = session.roomType === "open";
      const roomId = isOpenRoom ? session.id.slice("open-".length) : session.id;
      const response = await fetch((isOpenRoom ? "/api/open-learning-rooms/" : "/api/learning-sessions/") + encodeURIComponent(roomId), { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: isOpenRoom ? "close" : "cancel" }) });
      const payload = await readApi<{ error?: string }>(response); if (!response.ok) throw new Error(payload.error || "Couldn’t cancel this session.");
      await load(); setNotice(session.roomType ? "Learning room closed." : "Learning session cancelled.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t cancel this session."); }
    finally { setBusy(""); }
  };

  const openInvitations = async (session: LearningSession) => {
    setError(""); setSelectedLearners([]); setInviting(session.id);
    try {
      const response = await fetch(`/api/learning-sessions/${encodeURIComponent(session.id)}/eligible-learners`, { credentials: "include" });
      const payload = await readApi<{ learners?: EligibleLearner[]; remaining?: number; error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || "Couldn’t load learners for this room.");
      setEligibleLearners(payload.learners || []); setInviteRemaining(payload.remaining || 0);
    } catch (cause) { setInviting(""); setError(cause instanceof Error ? cause.message : "Couldn’t load learners for this room."); }
  };

  const inviteSelected = async (session: LearningSession) => {
    setBusy(session.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/learning-sessions/${encodeURIComponent(session.id)}/participants`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds: selectedLearners }) });
      const payload = await readApi<{ error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || "Couldn’t invite those learners.");
      setInviting(""); await load(); setNotice("Learners have been added to the room. They can now join from Learning Rooms.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t invite those learners."); }
    finally { setBusy(""); }
  };

  const badge = (status: LearningSession["meetingStatus"]) => status === "ongoing" ? "bg-emerald-100 text-emerald-900" : status === "cancelled" ? "bg-red-100 text-red-900" : status === "completed" ? "bg-slate-100 text-slate-700" : status === "upcoming" ? "bg-amber-100 text-amber-900" : "bg-paper text-slate-700";
  return <WorkspaceShell user={user} title="Online learning rooms" eyebrow="Meet and learn" description="Join an open lesson, or return to a private room created from an accepted skill exchange." onLogout={onLogout} loggingOut={loggingOut} logoutError={logoutError}>
    {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}{notice && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}
    {loading ? <p role="status" className="rounded-2xl border border-ink/10 bg-white p-6 text-sm text-slate-600">Loading learning sessions…</p> : sessions.length === 0 ? <div className="rounded-2xl border border-dashed border-ink/15 bg-white p-8 text-center"><h2 className="font-display text-xl font-semibold">No learning rooms are open</h2><p className="mt-2 text-sm text-slate-600">Create a live session from the Sessions page, or check back when a student starts a lesson.</p><a href="/sessions" className="mt-4 inline-flex min-h-10 items-center rounded-full bg-forest px-4 text-sm font-semibold text-white">Go to Sessions</a></div> : <div className="space-y-4">{sessions.map((session) => {
      const canEdit = session.createdBy === user.id && session.status !== "completed" && session.meetingStatus !== "cancelled";
      const canSchedule = !session.scheduledAt && !session.cancelledAt && session.status === "scheduled";
      const canInvite = !session.roomType && session.createdBy === user.id && session.role === "teacher" && ["upcoming", "ongoing"].includes(session.meetingStatus);
      const isEditable = editing === session.id;
      return <article key={session.id} className="rounded-3xl border border-ink/10 bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap gap-2"><span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${badge(session.meetingStatus)}`}>{session.roomType ? "Open room" : session.meetingStatus.replace("_", " ")}</span><span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-slate-600">You are the {session.role}</span></div><h2 className="mt-3 break-words font-display text-2xl font-semibold text-ink">{session.title || session.skillName}</h2><p className="mt-1 text-sm text-slate-600">{session.skillName} · {session.durationMinutes} minutes · {displayDate(session.scheduledAt)}</p><p className="mt-3 text-sm text-slate-700">{session.roomType ? "Hosted by " : "With "}<a href={`/students/${encodeURIComponent(session.otherParticipant.id)}`} className="font-semibold text-forest underline underline-offset-2">{session.otherParticipant.fullName}</a></p>{session.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{session.description}</p>}</div><div className="flex flex-wrap gap-2">{session.scheduledAt && ["upcoming", "ongoing"].includes(session.meetingStatus) && <a href={`/learning-rooms/${encodeURIComponent(session.id)}`} className="inline-flex min-h-11 items-center rounded-full bg-forest px-5 text-sm font-semibold text-white hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-emerald-700">{session.roomType ? "Join room" : "Join scheduled room"}</a>}{canInvite && <button type="button" onClick={() => void openInvitations(session)} className="min-h-11 rounded-full border border-ink/15 px-4 text-sm font-semibold hover:bg-paper">Invite learners</button>}{canEdit && !session.roomType && !isEditable && <button type="button" onClick={() => setEditing(session.id)} className="min-h-11 rounded-full border border-ink/15 px-4 text-sm font-semibold hover:bg-paper">Reschedule</button>}{canEdit && <button type="button" onClick={() => void cancelSession(session)} disabled={busy === session.id} className="min-h-11 rounded-full border border-red-200 px-4 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:opacity-60">{session.roomType ? "Close room" : "Cancel session"}</button>}</div></div>
        <div className="mt-5 border-t border-ink/8 pt-4"><h3 className="text-sm font-semibold">Participants</h3><ul className="mt-2 flex flex-wrap gap-2">{(session.participants ?? []).map((participant) => <li key={participant.id} className="rounded-full bg-paper px-3 py-1.5 text-xs text-slate-700">{participant.fullName} · {participant.role}{participant.id === session.createdBy ? " · creator" : ""}</li>)}</ul></div>
        {inviting === session.id && <section aria-label="Invite learners" className="mt-4 rounded-2xl border border-ink/10 bg-paper/70 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">Add learners to this room</h3><p className="mt-1 text-xs text-slate-600">Only learners with an accepted {session.skillName} exchange with you can be invited. {inviteRemaining} places left (8 maximum).</p></div><button type="button" onClick={() => setInviting("")} className="rounded px-2 py-1 text-sm font-semibold text-slate-600 hover:bg-white">Close</button></div>{eligibleLearners.length === 0 ? <p className="mt-3 text-sm text-slate-600">There are no more eligible learners to add yet.</p> : <><ul className="mt-3 grid gap-2 sm:grid-cols-2">{eligibleLearners.map((learner) => <li key={learner.id}><label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-ink/10 bg-white px-3"><input type="checkbox" checked={selectedLearners.includes(learner.id)} disabled={inviteRemaining === 0 || (!selectedLearners.includes(learner.id) && selectedLearners.length >= inviteRemaining)} onChange={(event) => setSelectedLearners((current) => event.target.checked ? [...current, learner.id] : current.filter((id) => id !== learner.id))} /><span className="text-sm font-medium">{learner.fullName}</span></label></li>)}</ul><button type="button" onClick={() => void inviteSelected(session)} disabled={!selectedLearners.length || busy === session.id} className="mt-3 min-h-10 rounded-full bg-forest px-4 text-sm font-semibold text-white disabled:opacity-50">{busy === session.id ? "Adding learners…" : `Add ${selectedLearners.length || "selected"} learner${selectedLearners.length === 1 ? "" : "s"}`}</button></>}</section>}
        {canSchedule && !isEditable && session.status !== "completed" && <button type="button" onClick={() => setEditing(session.id)} className="mt-4 min-h-11 rounded-full bg-forest px-5 text-sm font-semibold text-white">Create learning room</button>}
        {isEditable && <ScheduleForm session={session} busy={busy === session.id} onSubmit={(body) => void saveSchedule(session, body)} onCancel={() => setEditing("")} reschedule={Boolean(session.scheduledAt)} />}
        {!session.roomType && session.meetingStatus === "completed" && session.status !== "completed" && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">The scheduled time has passed. Both participants still need to confirm completion on the <a href="/sessions" className="font-semibold underline">sessions page</a> before reviews are available.</p>}
      </article>;
    })}</div>}
  </WorkspaceShell>;
}
