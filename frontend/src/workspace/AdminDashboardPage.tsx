import { useCallback, useEffect, useState } from "react";
import type { PublicUser } from "../auth/types";

type View = "overview" | "users" | "reports" | "audit";
type RecordData = Record<string, unknown>;
const views: { id: View; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "users", label: "Users" },
  { id: "reports", label: "Reports" }, { id: "audit", label: "Audit log" },
];
const card = "rounded-2xl border border-ink/10 bg-white p-5 shadow-sm sm:p-6";
const button = "min-h-10 rounded-full border border-ink/15 px-4 text-sm font-semibold text-ink transition hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  let payload: RecordData = {};
  if (response.status !== 204) {
    const raw = await response.text();
    try {
      payload = raw ? JSON.parse(raw) as RecordData : {};
    } catch {
      throw new Error(response.ok ? "The server returned an unreadable response. Refresh the page and try again." : `Admin request failed (HTTP ${response.status}). Check that the backend is running, then try again.`);
    }
  }
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "The request could not be completed.");
  return payload as T;
}

function State({ error, loading, empty }: { error: string; loading: boolean; empty?: string }) {
  if (loading) return <p role="status" className="py-8 text-sm text-slate-500">Loading admin data…</p>;
  if (error) return <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>;
  if (empty) return <p className="py-8 text-sm text-slate-500">{empty}</p>;
  return null;
}

export function AdminDashboardPage({ user, onLogout, loggingOut, logoutError }: {
  user: PublicUser; onLogout: () => void; loggingOut: boolean; logoutError: string;
}) {
  const [view, setView] = useState<View>(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    return views.some((item) => item.id === requested) ? requested as View : "overview";
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<RecordData>({});
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [reportStatus, setReportStatus] = useState("pending");
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const [reportDetails, setReportDetails] = useState<Record<string, RecordData>>({});
  const [reportDetailErrors, setReportDetailErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      let result: RecordData;
      if (view === "overview") result = await api("/api/admin/overview");
      else if (view === "users") {
        const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) }); if (query) params.set("q", query); if (statusFilter) params.set("status", statusFilter); if (roleFilter) params.set("role", roleFilter);
        result = await api(`/api/admin/users?${params}`);
      } else if (view === "reports") result = await api(`/api/admin/reports?status=${encodeURIComponent(reportStatus)}&limit=${pageSize}&offset=${page * pageSize}`);
      else result = await api(`/api/admin/audit-logs?limit=${pageSize}&offset=${page * pageSize}`);
      setData(result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load admin data."); }
    finally { setLoading(false); }
  }, [view, query, statusFilter, roleFilter, reportStatus, page]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), view === "users" ? 250 : 0); return () => window.clearTimeout(timer); }, [load, view]);
  useEffect(() => { window.history.replaceState({}, "", `/admin?view=${view}`); }, [view]);
  useEffect(() => { setPage(0); }, [view, query, statusFilter, roleFilter, reportStatus]);

  const mutateUser = async (id: string, action: string, reason?: string, role?: string) => {
    try {
      await api(`/api/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ action, reason, role }) });
      setNotice("Account change saved."); await load();
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "Account change failed."); }
  };
  const updateReport = async (id: string, status: string) => {
    const moderationNotes = window.prompt("Add a moderation note (at least 3 characters):");
    if (moderationNotes === null || moderationNotes.trim().length < 3) return;
    try {
      await api(`/api/admin/reports/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status, moderationNotes }) });
      setNotice("Report updated and recorded in the audit log."); await load();
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "Report update failed."); }
  };
  const inspectReport = async (id: string) => {
    if (reportDetails[id]) {
      setReportDetails((current) => { const next = { ...current }; delete next[id]; return next; });
      return;
    }
    setReportDetailErrors((current) => ({ ...current, [id]: "" }));
    try {
      const details = await api<{ report: RecordData; reportedContent: RecordData | null }>(`/api/admin/reports/${encodeURIComponent(id)}`);
      setReportDetails((current) => ({ ...current, [id]: details as unknown as RecordData }));
    } catch (caught) {
      setReportDetailErrors((current) => ({ ...current, [id]: caught instanceof Error ? caught.message : "Could not inspect this report." }));
    }
  };

  const activeUsers = (data.users as { active?: number } | undefined)?.active ?? 0;
  // A view change renders before its effect loads the next response. The old
  // view may store objects where the new view expects arrays.
  const userRows = Array.isArray(data.users) ? data.users as RecordData[] : [];
  const reportRows = Array.isArray(data.reports) ? data.reports as RecordData[] : [];
  const auditRows = Array.isArray(data.logs) ? data.logs as RecordData[] : [];
  const currentTotal = Number(data.total || 0);
  const pageCount = Math.max(1, Math.ceil(currentTotal / pageSize));
  const statItems = view === "overview" ? [
    ["Registered users", (data.users as { total?: number } | undefined)?.total ?? 0],
    ["Active accounts", activeUsers], ["Suspended accounts", (data.users as { suspended?: number } | undefined)?.suspended ?? 0],
    ["Pending reports", (data.reports as { pending?: number } | undefined)?.pending ?? 0],
    ["Exchange requests", Object.values((data.requests || {}) as Record<string, number>).reduce((a, b) => a + b, 0)],
    ["Learning sessions", Object.values((data.sessions || {}) as Record<string, number>).reduce((a, b) => a + b, 0)],
  ] : [];

  return <main className="min-h-screen bg-paper text-ink">
    <header className="sticky top-0 z-30 border-b border-ink/10 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-[68px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-7 lg:px-10">
        <a href="/admin" className="rounded-lg font-display text-lg font-bold tracking-[-0.05em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest" aria-label="SkillSwap admin dashboard">skill<span className="text-emerald-800">swap</span><span className="ml-2 rounded-full bg-[#e9f1ed] px-2.5 py-1 align-middle font-sans text-[10px] font-bold uppercase tracking-wider text-forest">Admin</span></a>
        <div className="flex items-center gap-3"><span className="hidden max-w-48 truncate text-sm text-slate-600 sm:inline">{user.fullName}</span><button type="button" onClick={onLogout} disabled={loggingOut} className="min-h-10 rounded-lg border border-ink/15 px-4 text-sm font-semibold hover:bg-paper focus-visible:outline-2 focus-visible:outline-forest disabled:opacity-60">{loggingOut ? "Signing out…" : "Sign out"}</button></div>
      </div>
      <nav aria-label="Admin pages" className="border-t border-ink/8 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-1 px-4 py-2 sm:px-7 lg:px-10">
        {views.map((item) => <button key={item.id} type="button" aria-current={view === item.id ? "page" : undefined} onClick={() => { setNotice(""); setView(item.id); }} className={`${button} ${view === item.id ? "border-forest bg-forest text-white hover:bg-emerald-950" : "bg-white"}`}>{item.label}</button>)}
        </div>
      </nav>
    </header>
    {logoutError && <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-800">{logoutError}</p>}
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-7 sm:pt-10 lg:px-10 lg:pt-12">
      <div className="mb-7 max-w-3xl sm:mb-9"><p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Platform administration</p><h1 className="font-display text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">Admin dashboard</h1><p className="mt-2.5 text-sm leading-6 text-slate-600 sm:text-base">Review platform activity, manage accounts, and record moderation actions.</p></div>
      <div className="space-y-6">
      {notice && <p role="status" className="rounded-xl bg-[#e6f0df] p-3 text-sm text-forest">{notice}</p>}
      <State loading={loading} error={error} />

      {!loading && !error && view === "overview" && <>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Platform overview">
          {statItems.map(([label, value]) => <article className={card} key={label}><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-3 font-display text-3xl font-semibold text-forest">{value}</p></article>)}
        </section>
        <section className={card}><h2 className="font-display text-xl font-semibold">Recent moderation actions</h2>
          {((data.recentActions as RecordData[] | undefined) || []).length === 0 ? <p className="mt-4 text-sm text-slate-500">No moderation actions recorded yet.</p> : <ul className="mt-4 divide-y divide-ink/10">{(data.recentActions as RecordData[]).map((item) => <li key={String(item.id)} className="py-3 text-sm"><span className="font-semibold">{String(item.admin_name)}</span> · {String(item.action)} · {String(item.target_type)} {String(item.target_id)}<span className="mt-1 block text-xs text-slate-500">{String(item.created_at)}{item.reason ? ` · ${String(item.reason)}` : ""}</span></li>)}</ul>}
        </section>
      </>}

      {view === "users" && <section className={card}>
        <h2 className="font-display text-xl font-semibold">User management</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_150px]">
          <label className="sr-only" htmlFor="user-search">Search name or email</label><input id="user-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email" className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm" />
          <select aria-label="Filter by account status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm"><option value="">All statuses</option><option>active</option><option>suspended</option><option>removed</option></select>
          <select aria-label="Filter by role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm"><option value="">All roles</option><option>user</option><option>admin</option></select>
        </div>
        <p className="mt-3 text-xs text-slate-500">{Number(data.total || 0)} matching accounts</p>
        <State loading={loading} error={error} empty={userRows.length === 0 ? "No accounts match these filters." : undefined} />
        <div className="mt-3 divide-y divide-ink/10">{userRows.map((account) => <UserRow key={String(account.id)} account={account} currentUserId={user.id} onAction={mutateUser} />)}</div>
      </section>}

      {view === "reports" && <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-xl font-semibold">Reports and moderation</h2><select aria-label="Filter reports by status" value={reportStatus} onChange={(e) => setReportStatus(e.target.value)} className="min-h-10 rounded-xl border border-slate-300 px-3 text-sm"><option value="">All statuses</option><option value="pending">Pending</option><option value="under_review">Under review</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></div>
        <p className="mt-2 text-xs text-slate-500">Private message contents are not shown in report lists.</p>
        <State loading={loading} error={error} empty={reportRows.length === 0 ? "No reports in this status." : undefined} />
        <div className="mt-3 space-y-3">{reportRows.map((report) => <article key={String(report.id)} className="rounded-xl border border-ink/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">{String(report.targetType)} report · {String(report.status)}</p><p className="mt-2 text-sm">Target: {String(report.targetName || `${report.targetType} ${report.targetId}`)}</p><p className="mt-1 text-sm text-slate-600">Reported by {String(report.reporterName || "Removed account")}</p></div><time className="text-xs text-slate-500">{String(report.createdAt)}</time></div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{String(report.reason)}</p>{Boolean(report.moderationNotes) && <p className="mt-2 text-sm text-slate-500">Note: {String(report.moderationNotes)}</p>}
          <button className={`${button} mt-3`} type="button" aria-expanded={Boolean(reportDetails[String(report.id)])} onClick={() => void inspectReport(String(report.id))}>{reportDetails[String(report.id)] ? "Hide reported content" : "Inspect reported content"}</button>
          {reportDetailErrors[String(report.id)] && <p role="alert" className="mt-2 text-sm text-red-700">{reportDetailErrors[String(report.id)]}</p>}
          {reportDetails[String(report.id)] && (() => { const details = reportDetails[String(report.id)]; const content = details.reportedContent as RecordData | null; return <div className="mt-3 rounded-xl border border-ink/10 bg-paper p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reported {String(report.targetType)} content</p>{content ? content.type === "message" ? <><p className="mt-2 text-sm font-semibold">Message from {String(content.senderName || "Removed account")}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{String(content.body)}</p><time className="mt-2 block text-xs text-slate-500">{String(content.createdAt)}</time></> : <><p className="mt-2 text-sm font-semibold">{String(content.fullName)}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{String(content.bio || "No public bio.")}</p></> : <p className="mt-2 text-sm text-slate-600">The reported content is no longer available.</p>}</div>; })()}
          <div className="mt-4 flex flex-wrap gap-2">{(["under_review", "resolved", "dismissed"] as const).filter((status) => status !== report.status).map((status) => <button key={status} className={button} type="button" onClick={() => void updateReport(String(report.id), status)}>{status.replace("_", " ")}</button>)}</div>
        </article>)}</div>
      </section>}

      {view === "audit" && <section className={card}><h2 className="font-display text-xl font-semibold">Administrative audit log</h2><p className="mt-2 text-sm text-slate-500">Append-only records of account and moderation changes.</p>
        <State loading={loading} error={error} empty={auditRows.length === 0 ? "No administrative actions recorded." : undefined} />
        <ul className="mt-3 divide-y divide-ink/10">{auditRows.map((log) => <li key={String(log.id)} className="py-4"><p className="text-sm"><strong>{String(log.action)}</strong> · {String(log.adminName)} · {String(log.targetType)} {String(log.targetId)}</p><p className="mt-1 text-xs text-slate-500">{String(log.createdAt)}{log.reason ? ` · ${String(log.reason)}` : ""}</p></li>)}</ul>
      </section>}
      {view !== "overview" && !loading && !error && <nav aria-label="Admin results pages" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 bg-white p-3">
        <p className="text-sm text-slate-600">Page {Math.min(page + 1, pageCount)} of {pageCount} · {currentTotal} results</p>
        <div className="flex gap-2"><button type="button" className={button} disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button><button type="button" className={button} disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)}>Next</button></div>
      </nav>}
      </div>
    </div>
  </main>;
}

function UserRow({ account, currentUserId, onAction }: { account: RecordData; currentUserId: string; onAction: (id: string, action: string, reason?: string, role?: string) => Promise<void> }) {
  const [details, setDetails] = useState<RecordData | null>(null);
  const [detailsError, setDetailsError] = useState("");
  const id = String(account.id); const status = String(account.status); const role = String(account.role);
  const activity = (details?.activity || {}) as RecordData;
  const skillRows = Array.isArray(details?.skills) ? details.skills as RecordData[] : [];
  const requestRows = Array.isArray(details?.requests) ? details.requests as RecordData[] : [];
  const sessionRows = Array.isArray(details?.sessions) ? details.sessions as RecordData[] : [];
  const roomRows = Array.isArray(details?.openRooms) ? details.openRooms as RecordData[] : [];
  const toggleDetails = async () => {
    if (details) { setDetails(null); return; }
    setDetailsError("");
    try { setDetails(await api(`/api/admin/users/${encodeURIComponent(id)}`)); }
    catch (cause) { setDetailsError(cause instanceof Error ? cause.message : "Could not load account activity."); }
  };
  const action = (kind: string, prompt: string, nextRole?: string) => {
    const reason = window.prompt(prompt);
    if (reason === null || reason.trim().length < 3) return;
    const verb = kind === "remove" ? "soft-remove this account" : kind === "suspend" ? "suspend this account" : "change this account's role";
    if (kind === "remove" && !window.confirm("Remove this account? Existing sessions and references will be preserved, while sign-in is disabled.")) return;
    if ((kind === "suspend" || kind === "remove") && !window.confirm(`Confirm you want to ${verb}?`)) return;
    void onAction(id, kind, reason.trim(), nextRole);
  };
  return <article className="py-4">
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0"><p className="break-words font-semibold">{String(account.fullName)} {id === currentUserId && <span className="text-xs font-medium text-slate-500">(you)</span>} <span className="ml-1 rounded-full bg-paper px-2 py-1 text-xs font-medium">{role}</span> <span className="rounded-full bg-paper px-2 py-1 text-xs font-medium">{status}</span></p><p className="mt-1 break-all text-sm text-slate-600">{String(account.email)}</p><p className="mt-1 text-xs text-slate-500">Joined {String(account.createdAt)}{account.suspensionReason ? ` · Reason: ${String(account.suspensionReason)}` : ""}{account.removalReason ? ` · Removal: ${String(account.removalReason)}` : ""}</p></div>
      <div className="flex flex-wrap gap-2">
        <button className={button} type="button" onClick={() => void toggleDetails()}>{details ? "Hide details" : "View details"}</button>
        {status === "active" && <button className={button} disabled={id === currentUserId} type="button" onClick={() => action("suspend", "Reason for suspension:")}>Suspend</button>}
        {status === "suspended" && <button className={button} type="button" onClick={() => void onAction(id, "reinstate")}>Reinstate</button>}
        {status !== "removed" && <button className={button} disabled={id === currentUserId} type="button" onClick={() => action("remove", "Reason for removal:")}>Remove</button>}
        {status !== "removed" && role === "admin" && <button className={button} disabled={id === currentUserId} type="button" onClick={() => action("change_role", "Reason for demoting to regular user:", "user")}>Demote</button>}
        {status !== "removed" && role === "user" && <button className={button} type="button" onClick={() => action("change_role", "Reason for granting administrator access:", "admin")}>Promote</button>}
      </div>
    </div>
    {detailsError && <p role="alert" className="mt-3 text-sm text-red-700">{detailsError}</p>}
    {details && <div className="mt-4 space-y-4 rounded-xl bg-paper p-4 text-sm text-slate-700">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><p>Teaching skills: {String(activity.teachSkills ?? 0)}</p><p>Learning goals: {String(activity.learningGoals ?? 0)}</p><p>Exchange requests: {String(activity.exchangeRequests ?? 0)}</p><p>Learning sessions: {String(activity.sessions ?? 0)}</p></div>
      <section><h3 className="font-semibold text-ink">Skills ({skillRows.length})</h3>{skillRows.length ? <ul className="mt-2 grid gap-2 sm:grid-cols-2">{skillRows.map((skill) => <li key={String(skill.id)} className="rounded-lg border border-ink/10 bg-white p-3"><p className="font-semibold">{String(skill.name)} <span className="font-normal text-slate-500">· {skill.kind === "teach" ? "Teaches" : "Wants to learn"}</span></p><p className="mt-1 text-xs text-slate-600">{String(skill.category)} · {String(skill.experienceLevel)} · {String(skill.instructionLanguage)}</p><p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{String(skill.description)}</p></li>)}</ul> : <p className="mt-1 text-xs text-slate-500">No skills added.</p>}</section>
      <section><h3 className="font-semibold text-ink">Exchange requests ({requestRows.length})</h3>{requestRows.length ? <ul className="mt-2 divide-y divide-ink/10">{requestRows.map((request) => <li key={String(request.id)} className="py-2"><span className="font-medium">{String(request.direction)} · {String(request.skillName)}</span><span className="ml-2 rounded-full bg-white px-2 py-1 text-xs">{String(request.status)}</span><p className="mt-1 text-xs text-slate-500">{String(request.senderName)} → {String(request.recipientName)} · {String(request.createdAt)}</p></li>)}</ul> : <p className="mt-1 text-xs text-slate-500">No exchange requests.</p>}</section>
      <section><h3 className="font-semibold text-ink">Learning sessions ({sessionRows.length})</h3>{sessionRows.length ? <ul className="mt-2 divide-y divide-ink/10">{sessionRows.map((session) => <li key={String(session.id)} className="py-2"><span className="font-medium">{String(session.title || session.skillName)}</span><span className="ml-2 rounded-full bg-white px-2 py-1 text-xs">{String(session.status)} · {String(session.role)}</span><p className="mt-1 text-xs text-slate-500">Skill: {String(session.skillName)} · with {String(session.counterpartName)} · {String(session.scheduledAt || session.completedAt || "Not scheduled")}{session.cancelledAt ? ` · Cancelled ${String(session.cancelledAt)}` : ""}</p></li>)}</ul> : <p className="mt-1 text-xs text-slate-500">No scheduled sessions.</p>}</section>
      <section><h3 className="font-semibold text-ink">Learning rooms ({roomRows.length})</h3>{roomRows.length ? <ul className="mt-2 divide-y divide-ink/10">{roomRows.map((room) => <li key={String(room.id)} className="py-2"><span className="font-medium">{String(room.title)}</span><span className="ml-2 rounded-full bg-white px-2 py-1 text-xs">{String(room.status)} · {String(room.role)}</span><p className="mt-1 text-xs text-slate-500">Skill: {String(room.skillName)} · {String(room.participantCount)} participants · {String(room.scheduledAt)}</p></li>)}</ul> : <p className="mt-1 text-xs text-slate-500">No learning rooms.</p>}</section>
    </div>}
  </article>;
}
