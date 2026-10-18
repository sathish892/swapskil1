import { useEffect, useState } from "react";
import type { PublicUser } from "../auth/types";
import { readApi } from "./types";
import { WorkspaceShell } from "./WorkspaceShell";

type RequestItem = {
  id: string; status: "pending" | "accepted" | "rejected"; direction: "incoming" | "outgoing";
  createdAt: string; updatedAt: string; otherUser: { id: string; fullName: string; bio: string };
  skill: { id: string; name: string; category: string; kind: "teach" | "learn" } | null;
};
type RequestPayload = { requests: RequestItem[]; error?: string };

export function RequestsPage({ user, onLogout, loggingOut, logoutError }: {
  user: PublicUser; onLogout: () => void; loggingOut: boolean; logoutError: string;
}) {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/exchange-requests", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        const payload = await readApi<RequestPayload>(response);
        if (!response.ok || !payload.requests) throw new Error(payload.error || "Couldn’t load exchange requests.");
        setRequests(payload.requests);
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Couldn’t load exchange requests."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const decide = async (id: string, action: "accept" | "reject") => {
    setBusyId(id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/exchange-requests/" + encodeURIComponent(id), {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const payload = await readApi<{ request?: { status: RequestItem["status"] }; error?: string }>(response);
      if (!response.ok || !payload.request) throw new Error(payload.error || "Couldn’t update this request.");
      setRequests((items) => items.map((item) => item.id === id ? { ...item, status: payload.request!.status } : item));
      setMessage(action === "accept" ? "Exchange request accepted." : "Exchange request declined.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t update this request.");
    } finally { setBusyId(""); }
  };

  const statusClass = (status: RequestItem["status"]) => status === "accepted"
    ? "bg-emerald-100 text-emerald-900"
    : status === "rejected" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-900";

  return <WorkspaceShell user={user} title="Exchange requests" eyebrow="Connect with care" description="Review requests sent to you and keep track of requests you have sent." onLogout={onLogout} loggingOut={loggingOut} logoutError={logoutError}>
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</p>}
      {loading ? <p role="status" className="rounded-2xl border border-ink/10 bg-white p-7 text-sm text-slate-600">Loading exchange requests…</p>
        : requests.length === 0 ? <div className="rounded-3xl border border-dashed border-ink/15 bg-white p-8 text-center sm:p-12"><h2 className="font-display text-xl font-semibold text-ink">No exchange requests yet</h2><p className="mt-2 text-sm leading-6 text-slate-600">When you request an exchange or another student contacts you, it will appear here.</p><a href="/explore" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-forest px-5 text-sm font-semibold text-white transition hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Explore skills</a></div>
          : requests.map((item) => <article key={item.id} className="rounded-3xl border border-ink/10 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className={"rounded-full px-3 py-1 text-xs font-semibold capitalize " + statusClass(item.status)}>{item.status}</span><span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-slate-600">{item.direction === "incoming" ? "Received" : "Sent"}</span></div>
                <h2 className="mt-3 font-display text-xl font-semibold text-ink">{item.direction === "incoming" ? item.otherUser.fullName + " sent you a request" : "Request to " + item.otherUser.fullName}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.skill ? "About " + item.skill.name + " · " + item.skill.category : "The related skill entry has since been removed."}</p>
                <a href={"/students/" + encodeURIComponent(item.otherUser.id)} className="mt-3 inline-flex rounded-sm text-sm font-semibold text-forest underline decoration-forest/25 underline-offset-4 hover:text-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">View public profile ↗</a>
                {item.status === "accepted" && <a href="/sessions" className="ml-4 mt-3 inline-flex rounded-sm text-sm font-semibold text-forest underline decoration-forest/25 underline-offset-4 hover:text-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Open learning session ↗</a>}
              </div>
              {item.direction === "incoming" && item.status === "pending" && <div className="flex shrink-0 gap-2 sm:pt-1">
                <button type="button" disabled={busyId === item.id} onClick={() => void decide(item.id, "reject")} className="min-h-11 rounded-full border border-ink/15 px-4 text-sm font-semibold text-ink hover:bg-paper focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50">Decline</button>
                <button type="button" disabled={busyId === item.id} onClick={() => void decide(item.id, "accept")} className="min-h-11 rounded-full bg-forest px-4 text-sm font-semibold text-white hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50">{busyId === item.id ? "Saving…" : "Accept"}</button>
              </div>}
            </div>
          </article>)}
    </div>
  </WorkspaceShell>;
}
