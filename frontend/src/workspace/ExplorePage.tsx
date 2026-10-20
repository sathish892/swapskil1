import { useEffect, useMemo, useState } from "react";
import type { PublicUser } from "../auth/types";
import { readApi, skillCategories, experienceLevels, languages, type SkillEntry } from "./types";
import { WorkspaceShell } from "./WorkspaceShell";

type Person = { id: string; fullName: string; bio: string; interests: string[]; avatarUrl?: string };
type SkillResult = { skill: SkillEntry; user: Person };
type MatchResult = { skill: SkillEntry; matchedSkill: SkillEntry; user: Person; explanation: string };
type SearchPayload = { results: SkillResult[]; total: number; limit: number; offset: number };
type MatchPayload = { results: MatchResult[]; total: number; limit: number; offset: number };
type RequestPayload = { request?: { id: string; status: string }; error?: string };
type RequestListPayload = { requests: { direction: string; status: string; otherUser: { id: string }; skill: { id: string } | null }[] };
type View = "teach" | "learn" | "matches";

export function ExplorePage({ user, onLogout, loggingOut, logoutError }: {
  user: PublicUser; onLogout: () => void; loggingOut: boolean; logoutError: string;
}) {
  const [view, setView] = useState<View>(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    return requested === "learn" || requested === "matches" ? requested : "teach";
  });
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("q") || "");
  const [roadmapGoal] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("roadmapChallenge") === "1" ? params.get("q") || "your career goal" : "";
  });
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("");
  const [language, setLanguage] = useState("");
  const [items, setItems] = useState<(SkillResult | MatchResult)[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestingId, setRequestingId] = useState("");
  const [activeUserIds, setActiveUserIds] = useState<Set<string>>(new Set());
  const [retryCounter, setRetryCounter] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/exchange-requests", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await readApi<RequestListPayload>(response);
        setActiveUserIds(new Set(payload.requests.filter((item) => item.direction === "outgoing" && ["pending", "accepted"].includes(item.status)).map((item) => item.otherUser.id)));
      }).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query, category, experienceLevel: level, instructionLanguage: language, limit: "12", offset: String(offset) });
      const endpoint = view === "matches"
        ? "/api/explore/matches?" + params.toString()
        : "/api/explore/skills?" + new URLSearchParams({ q: query, category, experienceLevel: level, instructionLanguage: language, limit: "12", offset: String(offset), kind: view }).toString();
      fetch(endpoint, { credentials: "include", signal: controller.signal })
        .then(async (response) => {
          const payload = await readApi<SearchPayload | MatchPayload>(response);
          if (!response.ok) throw new Error(payload.error || "Couldn’t search skills.");
          setItems(payload.results); setTotal(payload.total);
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Couldn’t search skills.");
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [view, query, category, level, language, offset, retryCounter]);

  const filtersActive = Boolean(query || category || level || language);
  const clearFilters = () => { setQuery(""); setCategory(""); setLevel(""); setLanguage(""); setOffset(0); };
  const isMatch = (item: SkillResult | MatchResult): item is MatchResult => "matchedSkill" in item;
  const pageNumber = Math.floor(offset / 12) + 1;
  const totalPages = Math.max(1, Math.ceil(total / 12));
  const matchesHeading = useMemo(() => view === "matches", [view]);

  const sendRequest = async (item: SkillResult | MatchResult) => {
    setRequestError(""); setRequestMessage(""); setRequestingId(item.skill.id);
    try {
      const response = await fetch("/api/exchange-requests", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientUserId: item.user.id, skillId: item.skill.id }),
      });
      const payload = await readApi<RequestPayload>(response);
      if (!response.ok) throw new Error(payload.error || "Couldn’t send the exchange request.");
      setActiveUserIds((current) => new Set(current).add(item.user.id));
      setRequestMessage("Your exchange request was sent to " + item.user.fullName + ".");
    } catch (cause) {
      setRequestError(cause instanceof Error ? cause.message : "Couldn’t send the exchange request.");
    } finally { setRequestingId(""); }
  };

  return <WorkspaceShell user={user} title="Explore skills" eyebrow="Find a learning partner" description="Search what students can teach and what they hope to learn, or see clear suggestions based on your own skill lists." onLogout={onLogout} loggingOut={loggingOut} logoutError={logoutError}>
    <div className="space-y-5">
      {requestError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{requestError}</p>}
      {requestMessage && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">{requestMessage} <a href="/requests" className="ml-1 underline underline-offset-2">View requests</a></p>}
      {roadmapGoal && <div className="rounded-2xl border border-emerald-900/10 bg-[#eaf1e5] p-4 sm:p-5"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-800">Roadmap peer challenge</p><h2 className="mt-1 font-display text-lg font-semibold text-ink">Find someone who can help with “{roadmapGoal}”</h2><p className="mt-1 text-sm leading-6 text-slate-700">We searched students who can teach related skills. Send an exchange request to learn together, then use the shared challenge steps from your roadmap.</p></div>}
      <div className="rounded-3xl border border-ink/10 bg-white p-4 shadow-sm sm:p-6">
        <div role="tablist" aria-label="Explore skill views" className="mb-5 flex flex-wrap gap-2">
          {([["teach", "Can teach"], ["learn", "Wants to learn"], ["matches", "Suggested matches"]] as const).map(([value, label]) =>
            <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => { setView(value); setOffset(0); }} className={"min-h-10 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 " + (view === value ? "bg-forest text-white" : "bg-paper text-slate-700 hover:bg-[#edf2e7]")}>{label}</button>)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr_auto] xl:items-end">
          <div>
            <label htmlFor="explore-query" className="mb-2 block text-sm font-semibold text-ink">Search skill names</label>
            <input id="explore-query" value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} placeholder="Try Python or visual design" maxLength={120} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-900/10" />
          </div>
          <div>
            <label htmlFor="explore-category" className="mb-2 block text-sm font-semibold text-ink">Category</label>
            <select id="explore-category" value={category} onChange={(event) => { setCategory(event.target.value); setOffset(0); }} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-900/10">
              <option value="">All categories</option>{skillCategories.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="explore-level" className="mb-2 block text-sm font-semibold text-ink">{matchesHeading ? "Matched skill level" : "Experience level"}</label>
            <select id="explore-level" value={level} onChange={(event) => { setLevel(event.target.value); setOffset(0); }} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-900/10">
              <option value="">Any level</option>{experienceLevels.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="explore-language" className="mb-2 block text-sm font-semibold text-ink">Language</label>
            <select id="explore-language" value={language} onChange={(event) => { setLanguage(event.target.value); setOffset(0); }} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-900/10">
              <option value="">Any language</option>{languages.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <button type="button" onClick={clearFilters} disabled={!filtersActive} className="min-h-12 rounded-full border border-ink/15 px-5 text-sm font-semibold text-ink transition hover:bg-paper focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-45">Clear filters</button>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">{view === "matches" ? "Suggestions compare your teach/learn lists. Exact skill and category matches rank first; related-category suggestions are labeled." : view === "teach" ? "Browse skills students are ready to share." : "Browse skills students would like to learn."}</p>
      </div>
      {loading ? <p role="status" className="rounded-2xl border border-ink/10 bg-white p-7 text-sm text-slate-600">Searching skills…</p>
        : error ? <div role="alert" className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"><p>{error}</p><button type="button" onClick={() => { setLoading(true); setRetryCounter((current) => current + 1); }} className="min-h-10 self-start rounded-lg border border-red-300 bg-white px-4 font-semibold text-red-900 hover:bg-red-100 sm:self-auto">Try again</button></div>
          : items.length === 0 ? <div className="rounded-3xl border border-dashed border-ink/15 bg-white p-8 text-center sm:p-12">
            <h2 className="font-display text-xl font-semibold text-ink">No results found</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">{view === "matches" ? "Add skills to both your teach and learn lists to receive suggestions. You can also clear filters to broaden this search." : "Try another skill name or clear one or more filters."}</p>
            {filtersActive && <button type="button" onClick={clearFilters} className="mt-5 min-h-11 rounded-full bg-forest px-5 text-sm font-semibold text-white transition hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Clear filters</button>}
          </div>
          : <section aria-label={view === "teach" ? "Students who can teach" : view === "learn" ? "Students who want to learn" : "Skill match suggestions"} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => {
              const matched = isMatch(item);
              return <article key={item.skill.id} className="flex min-w-0 flex-col rounded-3xl border border-ink/10 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#e4f0dc] px-3 py-1.5 text-xs font-semibold text-forest">{item.skill.category}</span>
                  <span className="rounded-full bg-paper px-3 py-1.5 text-xs font-semibold text-slate-600">{item.skill.experienceLevel}</span>
                  <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800">In {item.skill.instructionLanguage}</span>
                </div>
                <h2 className="mt-4 break-words font-display text-xl font-semibold tracking-[-0.03em] text-ink">{item.skill.name}</h2>
                <p className="mt-2 flex-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{item.skill.description}</p>
                {matched && <div className="mt-4 rounded-2xl border border-emerald-900/10 bg-[#f1f5eb] p-3 text-xs leading-5 text-forest"><span className="font-bold">Suggested because: </span>{item.explanation}</div>}
                {matched && <p className="mt-3 text-xs text-slate-500">Related to your <span className="font-semibold">{item.matchedSkill.kind === "teach" ? "teaching" : "learning"} skill</span>: {item.matchedSkill.name}</p>}
                <div className="mt-5 flex items-center justify-between gap-3 border-t border-ink/8 pt-4">
                  <div className="flex min-w-0 items-center gap-2">
                    {item.user.avatarUrl ? <img src={item.user.avatarUrl} alt="" className="size-8 rounded-full object-cover" /> : <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-[#e9f1ed] text-xs font-bold text-forest">{item.user.fullName.trim().slice(0, 1).toUpperCase()}</span>}
                    <a href={"/students/" + encodeURIComponent(item.user.id)} className="min-w-0 truncate rounded-sm text-sm font-semibold text-forest underline decoration-forest/25 underline-offset-4 transition hover:text-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" title={"View " + item.user.fullName + "'s public profile"}>{item.user.fullName}</a>
                  </div>
                  <a href={"/students/" + encodeURIComponent(item.user.id)} aria-label={"View " + item.user.fullName + "'s profile"} className="shrink-0 text-xs font-semibold text-slate-500 hover:text-forest focus-visible:outline-2 focus-visible:outline-emerald-700">View profile ↗</a>
                </div>
                <button type="button" onClick={() => void sendRequest(item)} disabled={requestingId === item.skill.id || activeUserIds.has(item.user.id)} className="mt-4 min-h-11 w-full rounded-full bg-forest px-5 text-sm font-semibold text-white transition hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-default disabled:bg-slate-300 disabled:text-slate-600">
                  {requestingId === item.skill.id ? "Sending request…" : activeUserIds.has(item.user.id) ? "Request already active" : "Request exchange"}
                </button>
              </article>;
            })}
          </section>}
      {!loading && !error && total > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm"><p>Showing {offset + 1}–{Math.min(offset + items.length, total)} of {total}</p><div className="flex gap-2"><button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 12))} className="min-h-10 rounded-full border border-ink/15 px-4 font-semibold text-ink hover:bg-paper disabled:opacity-40">Previous</button><span className="self-center px-1 text-xs">Page {pageNumber} of {totalPages}</span><button type="button" disabled={offset + 12 >= total} onClick={() => setOffset(offset + 12)} className="min-h-10 rounded-full border border-ink/15 px-4 font-semibold text-ink hover:bg-paper disabled:opacity-40">Next</button></div></div>}
    </div>
  </WorkspaceShell>;
}
