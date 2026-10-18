import { useEffect, useMemo, useState } from "react";
import type { PublicUser } from "../auth/types";
import { readApi } from "./types";

type PublicSkill = { id: string; kind: "teach" | "learn"; name: string; category: string; experienceLevel: string; description: string; instructionLanguage: string };
type PublicProfile = { id: string; fullName: string; bio: string; interests: string[]; learningSkillsPublic: boolean; avatarUrl: string };
type ProfileRating = { average: number | null; count: number };
type PublicReview = { id: string; stars: number; reviewText: string; createdAt: string; reviewer: { id: string; fullName: string } };
type ProfilePayload = { profile?: PublicProfile; skills?: { teach: PublicSkill[]; learn: PublicSkill[] }; ratings?: { teacher: ProfileRating; learner: ProfileRating }; reviews?: { teacher: PublicReview[]; learner: PublicReview[] }; error?: string };

export function PublicProfilePage({ profileId, user }: { profileId: string; user: PublicUser | null }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [teach, setTeach] = useState<PublicSkill[]>([]);
  const [learn, setLearn] = useState<PublicSkill[]>([]);
  const [ratings, setRatings] = useState<{ teacher: ProfileRating; learner: ProfileRating }>({ teacher: { average: null, count: 0 }, learner: { average: null, count: 0 } });
  const [reviews, setReviews] = useState<{ teacher: PublicReview[]; learner: PublicReview[] }>({ teacher: [], learner: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestingId, setRequestingId] = useState("");
  const [hasActiveRequest, setHasActiveRequest] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [messageError, setMessageError] = useState("");
  const [openingMessage, setOpeningMessage] = useState(false);
  const [reportNotice, setReportNotice] = useState("");
  const isOwner = user?.id === profileId;
  const initials = useMemo(() => profile?.fullName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "S", [profile?.fullName]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public/profiles/" + encodeURIComponent(profileId), { signal: controller.signal })
      .then(async (response) => {
        const payload = await readApi<ProfilePayload>(response);
        if (!response.ok || !payload.profile || !payload.skills) throw new Error(payload.error || "Couldn’t load this profile.");
        setProfile(payload.profile); setTeach(payload.skills.teach); setLearn(payload.skills.learn);
        setRatings(payload.ratings || { teacher: { average: null, count: 0 }, learner: { average: null, count: 0 } });
        setReviews(payload.reviews || { teacher: [], learner: [] });
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Couldn’t load this profile."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [profileId]);

  useEffect(() => {
    if (!user) { setHasActiveRequest(false); return; }
    const controller = new AbortController();
    fetch("/api/exchange-requests", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await readApi<{ requests: { direction: string; status: string; otherUser: { id: string } }[] }>(response);
        setHasActiveRequest(payload.requests.some((item) => item.direction === "outgoing" && item.otherUser.id === profileId && ["pending", "accepted"].includes(item.status)));
      }).catch(() => {});
    return () => controller.abort();
  }, [profileId, user?.id]);

  const requestExchange = async (entry: PublicSkill) => {
    if (!profile) return;
    if (!user) {
      window.location.assign("/login?redirect=" + encodeURIComponent(window.location.pathname));
      return;
    }
    setRequestingId(entry.id); setRequestError(""); setRequestMessage("");
    try {
      const response = await fetch("/api/exchange-requests", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientUserId: profile.id, skillId: entry.id }),
      });
      const payload = await readApi<{ error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || "Couldn’t send the exchange request.");
      setHasActiveRequest(true);
      setRequestMessage("Your exchange request was sent to " + profile.fullName + ".");
    } catch (cause) {
      setRequestError(cause instanceof Error ? cause.message : "Couldn’t send the exchange request.");
      if (cause instanceof Error && cause.message.includes("already have an active request")) setHasActiveRequest(true);
    } finally { setRequestingId(""); }
  };

  const openConversation = async () => {
    if (!profile) return;
    if (!user) { window.location.assign("/login?redirect=" + encodeURIComponent(window.location.pathname)); return; }
    setOpeningMessage(true); setMessageError("");
    try {
      const response = await fetch("/api/conversations/direct", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: profile.id }) });
      const result = await readApi<{ conversation?: { id: string }; error?: string }>(response);
      if (!response.ok || !result.conversation) throw new Error(result.error || "Couldn’t open a conversation.");
      window.location.assign("/messages?conversation=" + encodeURIComponent(result.conversation.id));
    } catch (cause) { setMessageError(cause instanceof Error ? cause.message : "Couldn’t open a conversation."); }
    finally { setOpeningMessage(false); }
  };

  const reportProfile = async () => {
    if (!user) { window.location.assign("/login?redirect=" + encodeURIComponent(window.location.pathname)); return; }
    const reason = window.prompt("Why are you reporting this profile? Please provide at least 10 characters.");
    if (reason === null) return;
    try {
      const response = await fetch("/api/reports", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType: "profile", targetId: profileId, reason }) });
      const result = await readApi<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Couldn’t submit the report.");
      setReportNotice("Report submitted for administrator review.");
    } catch (cause) { setReportNotice(cause instanceof Error ? cause.message : "Couldn’t submit the report."); }
  };

  const skillSection = (title: string, items: PublicSkill[], kind: "teach" | "learn") => <section aria-label={title} className="rounded-3xl border border-ink/10 bg-white p-5 shadow-sm sm:p-7">
    <h2 className="font-display text-2xl font-semibold tracking-[-0.04em] text-ink">{title}</h2>
    {items.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-ink/15 bg-paper/70 p-4 text-sm leading-6 text-slate-600">{kind === "learn" && profile?.learningSkillsPublic ? "No learning goals shared yet." : "No skills listed yet."}</p> : <ul className="mt-4 space-y-3">
      {items.map((entry) => <li key={entry.id} className="rounded-2xl border border-ink/8 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2"><span className="rounded-full bg-[#e4f0dc] px-3 py-1 text-xs font-semibold text-forest">{entry.category}</span><span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-slate-600">{entry.experienceLevel}</span><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">In {entry.instructionLanguage}</span></div>
            <h3 className="mt-3 break-words font-display text-lg font-semibold text-ink">{entry.name}</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{entry.description}</p>
          </div>
          {!isOwner && <button type="button" onClick={() => void requestExchange(entry)} disabled={requestingId === entry.id || hasActiveRequest} className="min-h-10 shrink-0 rounded-full bg-forest px-4 text-sm font-semibold text-white transition hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:bg-slate-300 disabled:text-slate-600">{requestingId === entry.id ? "Sending…" : hasActiveRequest ? "Request already active" : "Request exchange"}</button>}
        </div>
      </li>)}
    </ul>}
  </section>;

  const reviewSection = (type: "teacher" | "learner", title: string, description: string) => {
    const summary = ratings[type];
    return <section aria-labelledby={type + "-reviews-heading"} className="rounded-3xl border border-ink/10 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h3 id={type + "-reviews-heading"} className="font-display text-xl font-semibold text-ink">{title}</h3><p className="mt-1 text-sm text-slate-600">{description}</p></div><p className="text-sm font-semibold text-forest">{summary.count === 0 ? "No reviews yet" : <><span className="text-xl">{summary.average?.toFixed(1)}</span> / 5 · {summary.count} {summary.count === 1 ? "review" : "reviews"}</>}</p></div>
      {reviews[type].length > 0 && <ul className="mt-5 space-y-3">{reviews[type].map((review) => <li key={review.id} className="rounded-2xl border border-ink/8 bg-paper/60 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-ink"><a href={"/students/" + encodeURIComponent(review.reviewer.id)} className="underline decoration-emerald-700/40 underline-offset-2">{review.reviewer.fullName}</a></p><time className="text-xs text-slate-500" dateTime={review.createdAt}>{new Date(review.createdAt.replace(" ", "T") + (review.createdAt.includes("Z") ? "" : "Z")).toLocaleDateString()}</time></div><p className="mt-1 text-sm font-semibold text-amber-700" aria-label={review.stars + " out of 5 stars"}>{"★".repeat(review.stars)}{"☆".repeat(5 - review.stars)} <span className="sr-only">{review.stars} out of 5 stars</span></p>{review.reviewText && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{review.reviewText}</p>}</li>)}</ul>}
    </section>;
  };

  return <main className="min-h-screen bg-paper text-ink">
    <header className="border-b border-ink/8 bg-paper/95">
      <div className="mx-auto flex min-h-[72px] max-w-5xl items-center justify-between gap-4 px-4 sm:px-7 lg:px-10">
        <a href="/" className="inline-flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"><span className="grid size-9 place-items-center rounded-xl bg-forest text-lime"><span aria-hidden="true">↔</span></span><span className="font-display text-lg font-bold tracking-[-0.06em]">skill<span className="text-emerald-800">swap</span></span></a>
        <nav aria-label="Profile navigation" className="flex items-center gap-2">{user ? <><a href="/explore" className="rounded-full px-3 py-2 text-sm font-semibold text-forest hover:bg-white focus-visible:outline-2 focus-visible:outline-emerald-700">Explore skills</a><a href="/requests" className="rounded-full px-3 py-2 text-sm font-semibold text-forest hover:bg-white focus-visible:outline-2 focus-visible:outline-emerald-700">Requests</a><a href="/messages" className="rounded-full px-3 py-2 text-sm font-semibold text-forest hover:bg-white focus-visible:outline-2 focus-visible:outline-emerald-700">Messages</a></> : <a href={"/login?redirect=" + encodeURIComponent(window.location.pathname)} className="rounded-full bg-forest px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-emerald-700">Log in</a>}</nav>
      </div>
    </header>
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-7 sm:py-12 lg:px-10">
      {loading ? <p role="status" className="rounded-2xl border border-ink/10 bg-white p-7 text-sm text-slate-600">Loading public profile…</p>
        : error ? <div role="alert" className="rounded-3xl border border-red-200 bg-red-50 p-7 text-center text-sm text-red-800"><h1 className="font-display text-2xl font-semibold">Profile unavailable</h1><p className="mt-2">{error}</p><a href="/" className="mt-5 inline-flex min-h-10 items-center rounded-full bg-forest px-5 font-semibold text-white">Back home</a></div>
          : profile && <>
            {requestError && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{requestError}</p>}
            {messageError && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{messageError}</p>}
            {requestMessage && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{requestMessage} <a href="/requests" className="ml-1 underline underline-offset-2">View requests</a></p>}
            <section className="rounded-3xl border border-ink/10 bg-white p-6 shadow-sm sm:p-9">
              <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:text-left">
                {profile.avatarUrl ? <img src={profile.avatarUrl} alt={profile.fullName + "'s profile"} className="size-24 shrink-0 rounded-full border-4 border-white object-cover shadow-lg shadow-forest/10" /> : <div role="img" aria-label={"Avatar for " + profile.fullName} className="grid size-24 shrink-0 place-items-center rounded-full border-4 border-white bg-[#e4f0dc] font-display text-2xl font-semibold text-forest shadow-lg shadow-forest/10">{initials}</div>}
                <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Student profile</p><h1 className="mt-2 break-words font-display text-3xl font-semibold tracking-[-0.05em] text-ink">{profile.fullName}</h1><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">{profile.bio || "This student hasn’t added a bio yet."}</p>
                  {profile.interests.length > 0 && <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">{profile.interests.map((interest) => <span key={interest} className="rounded-full bg-[#e4f0dc] px-3 py-1.5 text-xs font-semibold text-forest">{interest}</span>)}</div>}
                </div>
                {!isOwner && user && <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => void openConversation()} disabled={openingMessage} className="min-h-10 rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-950 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-60">{openingMessage ? "Opening…" : "Message"}</button><button type="button" onClick={() => void reportProfile()} className="min-h-10 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink hover:bg-paper">Report profile</button></div>}
                {isOwner && <a href="/profile" className="min-h-10 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink hover:bg-paper focus-visible:outline-2 focus-visible:outline-emerald-700">Edit profile</a>}
              </div>
              {reportNotice && <p role="status" className="mt-3 text-sm text-slate-600">{reportNotice}</p>}
            </section>
            <section aria-label="Student ratings" className="mt-5 grid gap-5 lg:grid-cols-2">
              {reviewSection("teacher", "Teacher ratings", "Feedback from students who learned with this person.")}
              {reviewSection("learner", "Learner ratings", "Feedback from students who taught this person.")}
            </section>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              {skillSection("Skills they can teach", teach, "teach")}
              {profile.learningSkillsPublic ? skillSection("Skills they want to learn", learn, "learn") : <section className="rounded-3xl border border-dashed border-ink/15 bg-white p-5 sm:p-7"><h2 className="font-display text-2xl font-semibold tracking-[-0.04em] text-ink">Learning goals</h2><p className="mt-4 text-sm leading-6 text-slate-600">This student has chosen to keep their learning goals private.</p></section>}
            </div>
          </>}
    </div>
  </main>;
}
