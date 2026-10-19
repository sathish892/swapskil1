import { useCallback, useEffect, useState } from "react";
import type { PublicUser } from "./types";
import { WorkspaceShell } from "../workspace/WorkspaceShell";
import { readApi, type SkillEntry } from "../workspace/types";

type RequestItem = { id: string; status: string; direction: "incoming" | "outgoing"; otherUser: { fullName: string }; skill: { name: string } | null; createdAt: string };
type SessionItem = { id: string; title: string; skillName: string; scheduledAt: string | null; durationMinutes: number; meetingStatus: string; cancelledAt: string | null; status: string; otherParticipant: { fullName: string } };
type Conversation = { id: string; name: string; kind: "direct" | "group"; unreadCount: number; lastMessage: { text: string; createdAt: string } | null };

const panel = "rounded-xl border border-ink/10 bg-white p-5 shadow-sm sm:p-6";
const button = "inline-flex min-h-10 items-center justify-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-semibold text-ink transition hover:border-forest/40 hover:bg-paper focus-visible:outline-2 focus-visible:outline-forest";

export function AccountPage({ user, onLogout, loggingOut, logoutError }: {
  user: PublicUser; onLogout: () => void; loggingOut: boolean; logoutError: string;
}) {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError(""); setLoading(true);
    const fetchDashboard = async () => {
      const responses = await Promise.all([
        fetch("/api/skills", { credentials: "include" }),
        fetch("/api/exchange-requests", { credentials: "include" }),
        fetch("/api/learning-sessions", { credentials: "include" }),
        fetch("/api/conversations", { credentials: "include" }),
      ]);
      const [skillData, requestData, sessionData, conversationData] = await Promise.all([
        readApi<{ skills?: SkillEntry[] }>(responses[0]), readApi<{ requests?: RequestItem[] }>(responses[1]),
        readApi<{ sessions?: SessionItem[] }>(responses[2]), readApi<{ conversations?: Conversation[] }>(responses[3]),
      ]);
      const failedIndex = responses.findIndex((response) => !response.ok);
      if (failedIndex >= 0) throw new Error([skillData, requestData, sessionData, conversationData][failedIndex].error || "Couldn’t load your dashboard.");
      setSkills(skillData.skills || []); setRequests(requestData.requests || []); setSessions(sessionData.sessions || []); setConversations(conversationData.conversations || []);
    };
    try {
      try {
        await fetchDashboard();
      } catch {
        // A free backend may be waking up or a mobile connection may drop one
        // response. Retry this read-only dashboard load once before showing an error.
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        await fetchDashboard();
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t connect to SkillSwap. Please try again."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const teach = skills.filter((skill) => skill.kind === "teach");
  const learn = skills.filter((skill) => skill.kind === "learn");
  const pending = requests.filter((request) => request.status === "pending");
  const upcomingAll = sessions.filter((session) => !session.cancelledAt && session.status !== "completed" && ["upcoming", "ongoing"].includes(session.meetingStatus))
    .sort((a, b) => (a.scheduledAt || "").localeCompare(b.scheduledAt || ""));
  const upcoming = upcomingAll.slice(0, 3);
  const recentChats = conversations.slice(0, 3);

  return <WorkspaceShell user={user} title={`Welcome, ${user.fullName.split(" ")[0]}.`} eyebrow="Your learning space" description="A quick look at what you’re sharing, learning, and planning next." onLogout={onLogout} loggingOut={loggingOut} logoutError={logoutError}>
    <div className="space-y-6">
      {error && <div role="alert" className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"><p>{error}</p><button type="button" onClick={() => void load()} className="min-h-10 self-start rounded-lg border border-red-300 px-4 font-semibold hover:bg-white sm:self-auto">Try again</button></div>}
      {logoutError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{logoutError}</p>}

      <section aria-label="Your activity" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[["Can teach", teach.length, "/my-skills"], ["Want to learn", learn.length, "/my-skills"], ["Pending requests", pending.length, "/requests"], ["Upcoming sessions", upcomingAll.length, "/sessions"]].map(([label, count, href]) => <a key={String(label)} href={String(href)} className={`${panel} group transition hover:border-forest/30 hover:shadow-md focus-visible:outline-2 focus-visible:outline-forest`}><p className="text-sm font-medium text-slate-600">{label}</p><p className="mt-3 font-display text-3xl font-semibold tracking-tight text-forest">{loading ? "—" : count}</p><span className="mt-3 block text-xs font-semibold text-emerald-800 group-hover:underline">Open {label.toString().toLowerCase()} →</span></a>)}
      </section>

      {!loading && !error && skills.length === 0 && requests.length === 0 && sessions.length === 0 && conversations.length === 0 && <section className={`${panel} border-forest/15 bg-[#eef4f1]`}><p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-800">A good place to start</p><h2 className="mt-2 font-display text-2xl font-semibold">Add a skill you can share or learn.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">Tell other students what you know and what you are curious about. You can update both lists any time.</p><div className="mt-5 flex flex-wrap gap-2"><a href="/my-skills" className="min-h-11 rounded-lg bg-forest px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-950">Add your skills</a><a href="/explore" className={button}>Explore students</a></div></section>}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={panel} aria-labelledby="dashboard-skills-title"><div className="flex items-start justify-between gap-3"><div><h2 id="dashboard-skills-title" className="font-display text-xl font-semibold">Your skills</h2><p className="mt-1 text-sm text-slate-600">What you can teach and want to learn.</p></div><a href="/my-skills" className="text-sm font-semibold text-forest underline underline-offset-4">Manage</a></div>
          {loading ? <p role="status" className="mt-5 text-sm text-slate-500">Loading your skills…</p> : <div className="mt-5 grid gap-4 sm:grid-cols-2"><SkillColumn title="I can teach" items={teach} empty="Add a skill you can teach." /><SkillColumn title="I want to learn" items={learn} empty="Choose a skill you want to learn." /></div>}
        </section>

        <section className={panel} aria-labelledby="dashboard-requests-title"><div className="flex items-start justify-between gap-3"><div><h2 id="dashboard-requests-title" className="font-display text-xl font-semibold">Skill exchange requests</h2><p className="mt-1 text-sm text-slate-600">See what is waiting for your reply.</p></div><a href="/requests" className="text-sm font-semibold text-forest underline underline-offset-4">View all</a></div>
          {loading ? <p role="status" className="mt-5 text-sm text-slate-500">Loading requests…</p> : pending.length === 0 ? <Empty text="No pending requests right now." href="/explore" action="Explore skills" /> : <ul className="mt-4 divide-y divide-ink/10">{pending.slice(0, 4).map((request) => <li key={request.id} className="py-3"><p className="text-sm font-semibold">{request.direction === "incoming" ? `${request.otherUser.fullName} sent you a request` : `Waiting for ${request.otherUser.fullName}`}</p><p className="mt-1 text-xs text-slate-600">{request.skill?.name || "Skill exchange"}</p></li>)}</ul>}
        </section>

        <section className={panel} aria-labelledby="dashboard-sessions-title"><div className="flex items-start justify-between gap-3"><div><h2 id="dashboard-sessions-title" className="font-display text-xl font-semibold">Upcoming learning sessions</h2><p className="mt-1 text-sm text-slate-600">Your next scheduled time to learn together.</p></div><a href="/sessions" className="text-sm font-semibold text-forest underline underline-offset-4">View sessions</a></div>
          {loading ? <p role="status" className="mt-5 text-sm text-slate-500">Loading sessions…</p> : upcoming.length === 0 ? <Empty text="No upcoming sessions. Accepted exchanges can be scheduled from Requests." href="/requests" action="View requests" /> : <ul className="mt-4 divide-y divide-ink/10">{upcoming.map((session) => <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold">{session.title || session.skillName}</p><p className="mt-1 text-xs text-slate-600">{session.scheduledAt ? new Date(session.scheduledAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Time not set"} · {session.durationMinutes} min</p></div>{session.meetingStatus === "ongoing" && <a href={`/learning-rooms/${encodeURIComponent(session.id)}`} className={`${button} text-xs`}>Join meeting</a>}</li>)}</ul>}
        </section>

        <section className={panel} aria-labelledby="dashboard-chats-title"><div className="flex items-start justify-between gap-3"><div><h2 id="dashboard-chats-title" className="font-display text-xl font-semibold">Recent conversations</h2><p className="mt-1 text-sm text-slate-600">Keep learning conversations moving.</p></div><a href="/messages" className="text-sm font-semibold text-forest underline underline-offset-4">Open messages</a></div>
          {loading ? <p role="status" className="mt-5 text-sm text-slate-500">Loading conversations…</p> : recentChats.length === 0 ? <Empty text="Your conversations will appear here when you connect with another student." href="/explore" action="Find a student" /> : <ul className="mt-4 divide-y divide-ink/10">{recentChats.map((conversation) => <li key={conversation.id}><a href={`/messages?conversation=${encodeURIComponent(conversation.id)}`} className="flex items-center justify-between gap-3 py-3 hover:text-forest"><span className="min-w-0"><span className="block truncate text-sm font-semibold">{conversation.kind === "group" ? `Group · ${conversation.name}` : conversation.name}</span><span className="mt-1 block truncate text-xs text-slate-600">{conversation.lastMessage?.text || "No messages yet"}</span></span>{conversation.unreadCount > 0 && <span className="grid size-6 shrink-0 place-items-center rounded-full bg-forest text-xs font-bold text-white">{conversation.unreadCount}</span>}</a></li>)}</ul>}
        </section>
      </div>
      <section className="flex flex-col gap-3 rounded-xl border border-ink/10 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-display text-lg font-semibold">Find your next skill partner</h2><p className="mt-1 text-sm text-slate-600">Search real student skill listings and send an exchange request.</p></div><a href="/explore" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-forest px-5 text-sm font-semibold text-white transition hover:bg-emerald-950">Explore skills</a></section>
    </div>
  </WorkspaceShell>;
}

function SkillColumn({ title, items, empty }: { title: string; items: SkillEntry[]; empty: string }) {
  return <div className="min-w-0"><h3 className="text-sm font-semibold text-ink">{title}</h3>{items.length ? <ul className="mt-2 space-y-2">{items.slice(0, 4).map((item) => <li key={item.id} className="truncate rounded-lg bg-paper px-3 py-2 text-sm">{item.name} <span className="text-xs text-slate-500">· {item.category}</span></li>)}</ul> : <Empty text={empty} href="/my-skills" action="Add skill" />}</div>;
}

function Empty({ text, href, action }: { text: string; href: string; action: string }) {
  return <div className="mt-4 rounded-lg border border-dashed border-ink/15 bg-paper/70 p-4"><p className="text-sm leading-5 text-slate-600">{text}</p><a href={href} className="mt-2 inline-flex min-h-8 items-center text-sm font-semibold text-forest underline underline-offset-4">{action}</a></div>;
}
