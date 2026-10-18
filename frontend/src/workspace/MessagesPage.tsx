import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicUser } from "../auth/types";
import { WorkspaceShell } from "./WorkspaceShell";
import { readApi } from "./types";

type Member = { id: string; fullName: string };
type Attachment = { id: string; name: string; contentType: string; size: number; url: string };
type Message = { id: string; text: string; createdAt: string; sender: Member; attachment: Attachment | null };
type Conversation = { id: string; kind: "direct" | "group"; name: string; createdBy: string | null; createdAt: string; members: Member[]; lastMessage: { text: string; senderName: string; createdAt: string } | null; unreadCount: number };

function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "S"; }
function dateLabel(value: string) { return new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z")).toLocaleString([], { dateStyle: "short", timeStyle: "short" }); }
function formatBytes(value: number) { return value < 1024 * 1024 ? Math.ceil(value / 1024) + " KB" : (value / 1024 / 1024).toFixed(1) + " MB"; }

export function MessagesPage({ user, onLogout, loggingOut, logoutError }: { user: PublicUser; onLogout: () => void; loggingOut: boolean; logoutError: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState(new URLSearchParams(window.location.search).get("conversation") || "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [before, setBefore] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [newMemberId, setNewMemberId] = useState("");
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const active = conversations.find((item) => item.id === selectedId) || null;

  const loadConversations = useCallback(async (quiet = false) => {
    try {
      const response = await fetch("/api/conversations", { credentials: "include" });
      const payload = await readApi<{ conversations?: Conversation[] }>(response);
      if (!response.ok) throw new Error(payload.error || "Couldn’t load conversations.");
      setConversations(payload.conversations || []); setOffline(false);
      if (selectedId && !(payload.conversations || []).some((item) => item.id === selectedId)) setSelectedId("");
    } catch (cause) {
      setOffline(true);
      if (!quiet) setError(cause instanceof Error ? cause.message : "Couldn’t load conversations.");
    } finally { if (!quiet) setLoading(false); }
  }, [selectedId]);

  const loadMessages = useCallback(async (conversationId: string, quiet = false) => {
    if (!conversationId) { setMessages([]); return; }
    try {
      if (!quiet) setLoadingMessages(true);
      const response = await fetch("/api/conversations/" + encodeURIComponent(conversationId) + "/messages?limit=40", { credentials: "include" });
      const payload = await readApi<{ messages?: Message[]; hasMore?: boolean; nextBefore?: string | null }>(response);
      if (!response.ok) throw new Error(payload.error || "Couldn’t load this conversation.");
      setMessages(payload.messages || []); setHasMore(Boolean(payload.hasMore)); setBefore(payload.nextBefore || null); setOffline(false);
      void loadConversations(true);
    } catch (cause) {
      setOffline(true);
      if (!quiet) setError(cause instanceof Error ? cause.message : "Couldn’t load this conversation.");
    } finally { if (!quiet) setLoadingMessages(false); }
  }, [loadConversations]);

  useEffect(() => { void loadConversations().finally(() => setLoading(false)); }, []); // initial view
  useEffect(() => { setMessages([]); setHasMore(false); setBefore(null); if (selectedId) void loadMessages(selectedId); }, [selectedId, loadMessages]);
  useEffect(() => {
    const timer = window.setInterval(() => { void loadConversations(true); if (selectedId) void loadMessages(selectedId, true); }, 5000);
    return () => window.clearInterval(timer);
  }, [loadConversations, loadMessages, selectedId]);

  const filtered = useMemo(() => conversations.filter((item) => (item.name + " " + (item.lastMessage?.text || "")).toLocaleLowerCase().includes(search.toLocaleLowerCase())), [conversations, search]);
  const chatContacts = useMemo(() => {
    const contacts = new Map<string, Member>();
    conversations.forEach((conversation) => conversation.members.forEach((member) => {
      if (member.id !== user.id) contacts.set(member.id, member);
    }));
    return [...contacts.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [conversations, user.id]);
  const activeMemberIds = new Set(active?.members.map((member) => member.id) || []);

  const createGroup = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/groups", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: groupName, memberIds: groupMemberIds }) });
      const payload = await readApi<{ conversation?: { id: string }; error?: string }>(response);
      if (!response.ok || !payload.conversation) throw new Error(payload.error || "Couldn’t create the group.");
      setShowGroupForm(false); setGroupName(""); setGroupMemberIds([]); await loadConversations(); setSelectedId(payload.conversation.id); setNotice("Group created.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t create the group."); }
    finally { setBusy(false); }
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault(); if (!active || (!text.trim() && !file)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const form = new FormData(); form.set("text", text); if (file) form.set("attachment", file);
      let payload: { message?: Message; error?: string };
      if (file) {
        setUploadProgress(0);
        payload = await new Promise((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open("POST", "/api/conversations/" + encodeURIComponent(active.id) + "/messages");
          request.withCredentials = true;
          request.upload.onprogress = (progress) => { if (progress.lengthComputable) setUploadProgress(Math.round(progress.loaded / progress.total * 100)); };
          request.onerror = () => reject(new Error("The upload was interrupted. Check your connection and try again."));
          request.onload = () => {
            let body: { message?: Message; error?: string } = {};
            try { body = JSON.parse(request.responseText) as typeof body; } catch { /* handled as a generic upload error */ }
            if (request.status < 200 || request.status >= 300) reject(new Error(body.error || "Couldn’t upload this attachment."));
            else resolve(body);
          };
          request.send(form);
        });
      } else {
        const response = await fetch("/api/conversations/" + encodeURIComponent(active.id) + "/messages", { method: "POST", credentials: "include", body: form });
        payload = await readApi<{ message?: Message; error?: string }>(response);
        if (!response.ok) throw new Error(payload.error || "Couldn’t send this message.");
      }
      if (!payload.message) throw new Error(payload.error || "Couldn’t send this message.");
      setMessages((current) => [...current, payload.message!]); setText(""); setFile(null); if (fileRef.current) fileRef.current.value = "";
      await loadConversations(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t send this message."); setOffline(true); }
    finally { setBusy(false); setUploadProgress(null); }
  };

  const loadOlder = async () => {
    if (!active || !before) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/conversations/" + encodeURIComponent(active.id) + "/messages?limit=40&before=" + encodeURIComponent(before), { credentials: "include" });
      const payload = await readApi<{ messages?: Message[]; hasMore?: boolean; nextBefore?: string | null }>(response);
      if (!response.ok) throw new Error(payload.error || "Couldn’t load older messages.");
      setMessages((current) => [...(payload.messages || []), ...current]); setHasMore(Boolean(payload.hasMore)); setBefore(payload.nextBefore || null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t load older messages."); }
    finally { setBusy(false); }
  };

  const addMember = async (event: React.FormEvent) => {
    event.preventDefault(); if (!active || !newMemberId.trim()) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/conversations/" + encodeURIComponent(active.id) + "/members", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: newMemberId.trim() }) });
      const payload = await readApi<{ error?: string }>(response); if (!response.ok) throw new Error(payload.error || "Couldn’t add that member.");
      setNewMemberId(""); await loadConversations(); setNotice("Group member added.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t add that member."); }
    finally { setBusy(false); }
  };

  const reportMessage = async (messageId: string) => {
    const reason = window.prompt("Why are you reporting this message? Please provide at least 10 characters.");
    if (reason === null) return;
    try {
      const response = await fetch("/api/reports", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType: "message", targetId: messageId, reason }) });
      const payload = await readApi<{ error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || "Couldn’t submit the report.");
      setNotice("Message report submitted for review.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t submit the report."); }
  };

  const removeMember = async (memberId: string) => {
    if (!active) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/conversations/" + encodeURIComponent(active.id) + "/members/" + encodeURIComponent(memberId), { method: "DELETE", credentials: "include" });
      const payload = response.status === 204 ? {} : await readApi<{ error?: string }>(response); if (!response.ok) throw new Error((payload as { error?: string }).error || "Couldn’t remove that member.");
      if (memberId === user.id) { setSelectedId(""); setNotice("You left the group."); }
      else setNotice("Group member removed.");
      await loadConversations();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t update group members."); }
    finally { setBusy(false); }
  };

  const attachmentView = (attachment: Attachment) => {
    const preview = attachment.url + "?inline=1";
    return <div className="mt-2 max-w-full">
      {attachment.contentType.startsWith("image/") && <a href={preview} target="_blank" rel="noreferrer"><img src={preview} alt={attachment.name} className="max-h-72 max-w-full rounded-xl object-contain" loading="lazy" /></a>}
      {attachment.contentType.startsWith("video/") && <video controls preload="metadata" src={preview} className="max-h-72 max-w-full rounded-xl" aria-label={attachment.name} />}
      <a href={attachment.url} download className="mt-2 inline-flex max-w-full items-center gap-2 rounded-xl border border-ink/10 bg-white/70 px-3 py-2 text-xs font-semibold text-forest hover:bg-white"><span className="truncate">{attachment.name}</span><span className="shrink-0 text-slate-500">{formatBytes(attachment.size)} · Download</span></a>
    </div>;
  };

  return <WorkspaceShell user={user} title="Messages" eyebrow="Keep learning together" description="Private conversations are available between students with an accepted exchange." onLogout={onLogout} loggingOut={loggingOut} logoutError={logoutError}>
    {error && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}
    {offline && <p role="status" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Connection interrupted. Messages will refresh when the server is reachable again.</p>}
    <div className="grid min-h-[70vh] overflow-hidden rounded-3xl border border-ink/10 bg-white shadow-sm lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className={`border-b border-ink/10 lg:border-b-0 lg:border-r ${active ? "hidden lg:block" : "block"}`} aria-label="Conversations">
        <div className="border-b border-ink/8 p-4"><div className="flex items-center justify-between gap-2"><h2 className="font-display text-lg font-semibold">Conversations</h2><button type="button" onClick={() => setShowGroupForm((open) => !open)} className="rounded-full border border-ink/15 px-3 py-2 text-xs font-semibold text-forest hover:bg-paper focus-visible:outline-2 focus-visible:outline-emerald-700">New group</button></div>
          <label className="sr-only" htmlFor="conversation-search">Search conversations</label><input id="conversation-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" className="mt-3 min-h-10 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-900/10" />
          {showGroupForm && <form onSubmit={createGroup} className="mt-4 space-y-3 rounded-2xl bg-paper p-3"><label className="block text-xs font-semibold">Group name<input required maxLength={80} value={groupName} onChange={(event) => setGroupName(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></label><fieldset className="space-y-2"><legend className="text-xs font-semibold">Add people from your chats <span className="font-normal text-slate-500">({groupMemberIds.length} selected)</span></legend>{chatContacts.length === 0 ? <p className="rounded-lg bg-white p-3 text-xs leading-5 text-slate-600">You need to have a conversation with someone before adding them to a group.</p> : <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-white p-2">{chatContacts.map((member) => <li key={member.id}><label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-paper"><input type="checkbox" checked={groupMemberIds.includes(member.id)} onChange={(event) => setGroupMemberIds((current) => event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id))} className="size-4 accent-emerald-800" /><span className="grid size-8 place-items-center rounded-full bg-[#e4f0dc] text-xs font-bold text-forest">{initials(member.fullName)}</span><span>{member.fullName}</span></label></li>)}</ul>}</fieldset><button disabled={busy || groupMemberIds.length === 0} className="min-h-10 rounded-full bg-forest px-4 text-xs font-semibold text-white disabled:opacity-60">{busy ? "Creating…" : "Create group"}</button></form>}
        </div>
        {loading ? <p role="status" className="p-4 text-sm text-slate-500">Loading conversations…</p> : filtered.length === 0 ? <p className="p-5 text-sm leading-6 text-slate-600">{conversations.length ? "No conversations match your search." : "No conversations yet. An accepted exchange lets you start a private chat from a student's profile."}</p> : <ul className="max-h-[60vh] overflow-y-auto p-2">{filtered.map((item) => <li key={item.id}><button type="button" onClick={() => { setSelectedId(item.id); setShowDetails(false); }} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-paper focus-visible:outline-2 focus-visible:outline-emerald-700 ${item.id === selectedId ? "bg-[#edf3e7]" : ""}`}><span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#e4f0dc] text-xs font-bold text-forest">{item.kind === "group" ? "#" : initials(item.name)}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-ink">{item.name}</span>{item.unreadCount > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-forest px-1.5 py-0.5 text-[10px] font-bold text-white">{item.unreadCount}</span>}</span><span className="mt-1 block truncate text-xs text-slate-500">{item.lastMessage?.text || (item.kind === "group" ? item.members.length + " members" : "No messages yet")}</span></span></button></li>)}</ul>}
      </aside>

      <section className={`${active ? "flex" : "hidden lg:flex"} min-w-0 flex-col`} aria-label="Chat">
        {!active ? <div className="m-auto max-w-sm p-8 text-center"><div aria-hidden="true" className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#e4f0dc] text-2xl text-forest">↔</div><h2 className="mt-4 font-display text-xl font-semibold">Choose a conversation</h2><p className="mt-2 text-sm leading-6 text-slate-600">Your messages and attachments stay visible only to conversation members.</p></div> : <>
          <header className="flex min-h-[68px] items-center justify-between gap-3 border-b border-ink/8 px-4 py-3 sm:px-6"><div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => setSelectedId("")} className="rounded-lg px-2 py-1 text-sm text-forest hover:bg-paper focus-visible:outline-2 focus-visible:outline-emerald-700 lg:hidden" aria-label="Back to conversations">←</button><span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e4f0dc] text-xs font-bold text-forest">{active.kind === "group" ? "#" : initials(active.name)}</span><div className="min-w-0"><h2 className="truncate font-semibold text-ink">{active.name}</h2><p className="text-xs text-slate-500">{active.kind === "group" ? active.members.length + " group members" : "Private conversation"}</p></div></div>{active.kind === "group" && <button type="button" onClick={() => setShowDetails((shown) => !shown)} className="min-h-10 rounded-full border border-ink/15 px-3 text-xs font-semibold text-forest hover:bg-paper focus-visible:outline-2 focus-visible:outline-emerald-700">{showDetails ? "Hide info" : "Group info"}</button>}</header>
          {showDetails && active.kind === "group" && <aside className="border-b border-ink/8 bg-paper/60 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Members</h3>{active.createdBy === user.id && <span className="text-xs text-slate-500">You are the group creator</span>}</div><ul className="mt-3 flex flex-wrap gap-2">{active.members.map((member) => <li key={member.id} className="flex items-center gap-2 rounded-full border border-ink/10 bg-white px-3 py-2 text-xs"><span className="grid size-6 place-items-center rounded-full bg-[#e4f0dc] font-bold text-forest">{initials(member.fullName)}</span>{member.fullName}{active.createdBy === member.id && <span className="rounded-full bg-[#e4f0dc] px-2 py-0.5 font-semibold text-forest">Creator</span>}{active.createdBy === user.id && member.id !== user.id && <button type="button" onClick={() => void removeMember(member.id)} aria-label={"Remove " + member.fullName} className="ml-1 text-red-700 underline underline-offset-2">Remove</button>}</li>)}</ul>{active.createdBy === user.id && <form onSubmit={addMember} className="mt-4 flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="group-member-id">Choose someone from your chats to add</label><select id="group-member-id" required value={newMemberId} onChange={(event) => setNewMemberId(event.target.value)} className="min-h-10 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Choose someone from your chats</option>{chatContacts.filter((member) => !activeMemberIds.has(member.id)).map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select><button disabled={busy || !newMemberId} className="min-h-10 rounded-full bg-forest px-4 text-xs font-semibold text-white disabled:opacity-60">Add member</button></form>}{active.createdBy === user.id && chatContacts.filter((member) => !activeMemberIds.has(member.id)).length === 0 && <p className="mt-2 text-xs text-slate-600">Everyone from your chats is already in this group.</p>}<button type="button" onClick={() => void removeMember(user.id)} disabled={busy} className="mt-3 min-h-9 rounded-full border border-red-200 px-4 text-xs font-semibold text-red-800 hover:bg-red-50 disabled:opacity-60">Leave group</button></aside>}
          <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6" aria-live="polite" aria-relevant="additions text">
            {loadingMessages ? <p role="status" className="text-center text-sm text-slate-500">Loading messages…</p> : <>
              {hasMore && <div className="text-center"><button type="button" onClick={() => void loadOlder()} disabled={busy} className="rounded-full px-4 py-2 text-xs font-semibold text-forest hover:bg-paper">{busy ? "Loading…" : "Load older messages"}</button></div>}
              {messages.length === 0 ? <p className="mt-10 text-center text-sm text-slate-500">No messages yet. Say hello to start the conversation.</p> : messages.map((message) => { const mine = message.sender.id === user.id; return <article key={message.id} className={`flex gap-2 ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 sm:max-w-[75%] ${mine ? "rounded-br-md bg-forest text-white" : "rounded-bl-md bg-paper text-ink"}`}><div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><p className="text-xs font-bold">{mine ? "You" : message.sender.fullName}</p><time className={`text-[10px] ${mine ? "text-white/65" : "text-slate-500"}`} dateTime={message.createdAt}>{dateLabel(message.createdAt)}</time></div>{message.text && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{message.text}</p>}{message.attachment && attachmentView(message.attachment)}<button type="button" onClick={() => void reportMessage(message.id)} className={`mt-2 text-[11px] underline underline-offset-2 ${mine ? "text-white/75" : "text-slate-500"}`}>Report message</button></div></article>; })}
            </>}
          </div>
          <form onSubmit={sendMessage} className="border-t border-ink/8 bg-white p-3 sm:p-4"><div className="flex items-end gap-2"><label className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-ink/10 text-lg text-forest hover:bg-paper" title="Attach a file"><span aria-hidden="true">＋</span><span className="sr-only">Choose an attachment</span><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,video/mp4,video/webm" onChange={(event) => setFile(event.target.files?.[0] || null)} className="sr-only" /></label><label className="sr-only" htmlFor="message-text">Write a message</label><textarea id="message-text" rows={1} maxLength={5000} value={text} onChange={(event) => setText(event.target.value)} placeholder="Write a message…" className="max-h-32 min-h-11 flex-1 resize-y rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-900/10" /><button type="submit" disabled={busy || (!text.trim() && !file)} className="min-h-11 shrink-0 rounded-full bg-forest px-4 text-sm font-semibold text-white hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50">{busy ? "Sending…" : "Send"}</button></div>{file && <p className="mt-2 flex items-center gap-2 text-xs text-slate-600"><span className="truncate">{file.name} · {formatBytes(file.size)}</span><button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} className="text-red-700 underline">Remove file</button></p>}{uploadProgress !== null && <div className="mt-2 flex items-center gap-2 text-xs text-slate-600"><progress aria-label="Attachment upload progress" max={100} value={uploadProgress} className="h-2 flex-1 accent-emerald-800" />{uploadProgress}%</div>}<p className="mt-2 text-[11px] text-slate-500">Allowed: PNG, JPEG, WebP, PDF, TXT, MP4, WebM · up to 20 MiB</p></form>
        </>}
      </section>
    </div>
  </WorkspaceShell>;
}
