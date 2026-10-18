import { useEffect, useState } from "react";
import type { PublicUser } from "../auth/types";
import { WorkspaceShell } from "./WorkspaceShell";
import { readApi } from "./types";

type RankedStudent = {
  id: string;
  fullName: string;
  avatarUrl: string;
  bio: string;
  completedSessions: number;
  teacherRating: number | null;
  teacherReviews: number;
  learnerRating: number | null;
  learnerReviews: number;
  rank: number;
};

function Rating({ label, average, count }: { label: string; average: number | null; count: number }) {
  return <div className="rounded-xl bg-paper px-3 py-2.5">
    <p className="text-xs font-semibold text-slate-500">{label}</p>
    <p className="mt-1 text-sm font-semibold text-ink">{count ? `${average?.toFixed(1)} / 5 · ${count} ${count === 1 ? "review" : "reviews"}` : "No reviews yet"}</p>
  </div>;
}

export function StudentRankingsPage({ user, onLogout, loggingOut, logoutError }: {
  user: PublicUser; onLogout: () => void; loggingOut: boolean; logoutError: string;
}) {
  const [students, setStudents] = useState<RankedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/student-rankings", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        const payload = await readApi<{ students?: RankedStudent[]; error?: string }>(response);
        if (!response.ok) throw new Error(payload.error || "Couldn’t load student rankings.");
        setStudents(payload.students || []);
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Couldn’t load student rankings."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  return <WorkspaceShell user={user} title="Student rankings" eyebrow="Learn and grow together" description="Meet students who have completed learning sessions. Rankings use completed sessions first, then compare teacher and learner ratings separately." onLogout={onLogout} loggingOut={loggingOut} logoutError={logoutError}>
    {loading ? <p role="status" className="rounded-2xl border border-ink/10 bg-white p-6 text-sm text-slate-600">Loading student rankings…</p>
      : error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">{error}</div>
        : students.length === 0 ? <div className="rounded-2xl border border-dashed border-ink/15 bg-white p-8 text-center sm:p-12"><h2 className="font-display text-xl font-semibold">No completed sessions yet</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Student rankings will appear here after learning sessions or learning rooms are completed.</p><a href="/explore" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-forest px-5 text-sm font-semibold text-white hover:bg-emerald-950">Explore skills</a></div>
          : <ol aria-label="Student rankings" className="space-y-4">{students.map((student) => {
            const initials = student.fullName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "S";
            return <li key={student.id} value={student.rank} className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm sm:p-6">
              <article className="grid gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-start">
                <div aria-label={`Rank ${student.rank}`} className="grid size-12 place-items-center rounded-2xl bg-[#e9f1ed] font-display text-lg font-bold text-forest">#{student.rank}</div>
                <div className="flex min-w-0 items-start gap-3">
                  {student.avatarUrl ? <img src={student.avatarUrl} alt="" className="size-12 shrink-0 rounded-full border border-ink/10 object-cover" /> : <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-[#e4f0dc] text-sm font-bold text-forest">{initials}</span>}
                  <div className="min-w-0"><h2 className="font-display text-lg font-semibold text-ink">{student.fullName}{student.id === user.id ? <span className="ml-2 text-xs font-medium text-slate-500">You</span> : null}</h2><p className="mt-1 text-sm text-slate-600">{student.bio || "No public bio yet."}</p><a href={`/students/${encodeURIComponent(student.id)}`} className="mt-2 inline-flex min-h-9 items-center font-semibold text-forest underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">View profile</a></div>
                </div>
                <p className="rounded-xl bg-[#f3f7ef] px-4 py-3 text-sm font-semibold text-forest sm:text-right"><span className="block text-2xl font-bold">{student.completedSessions}</span>{student.completedSessions === 1 ? "completed session" : "completed sessions"}</p>
              </article>
              <div className="mt-4 grid gap-3 border-t border-ink/8 pt-4 sm:grid-cols-2"><Rating label="Teacher rating" average={student.teacherRating} count={student.teacherReviews} /><Rating label="Learner rating" average={student.learnerRating} count={student.learnerReviews} /></div>
            </li>;
          })}</ol>}
  </WorkspaceShell>;
}
