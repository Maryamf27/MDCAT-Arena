import Link from "next/link";
import { ArrowRight, ChartNoAxesColumn, Target } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { getStudentAnalytics } from "@/lib/practice/history";

export async function PerformanceSection() {
  const user = await getAuthenticatedUser();
  if (!user) return <EmptyState icon={ChartNoAxesColumn} title="Sign in to see your progress" description="Your practice statistics and subject performance are private to your account." action={<Link href={`/login?next=${encodeURIComponent("/")}`} className="btn btn-primary">Sign in</Link>} />;

  let analytics;
  try {
    analytics = await getStudentAnalytics(user.id);
  } catch {
    return <ErrorState title="Performance unavailable" description="We couldn't load your saved practice statistics right now. Please try again later." />;
  }
  if (!analytics.overall.completedAttempts) return <EmptyState icon={ChartNoAxesColumn} title="No performance data yet" description="Your accuracy, attempts and subject-wise progress will appear here after you complete practice sessions." action={<Link href="/practice" className="btn btn-primary">Start practicing</Link>} />;

  const { overall, subjects, recentAttempts, progress, weakTopics } = analytics;
  return <div className="flex flex-col gap-6">
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Overall statistics">
      <Stat label="Completed attempts" value={overall.completedAttempts} />
      <Stat label="Questions" value={overall.totalQuestions} />
      <Stat label="Correct answers" value={overall.correctAnswers} />
      <Stat label="Overall accuracy" value={`${overall.accuracy}%`} hint={`${overall.averageScore}% average score`} />
    </section>

    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card p-5" aria-labelledby="subject-performance-title">
        <h3 id="subject-performance-title" className="text-heading">Subject performance</h3>
        {subjects.length ? <ul className="mt-4 flex flex-col gap-4">{subjects.map((subject) => <li key={subject.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3"><span className="font-bold">{subject.label}</span><span className="text-small text-muted">{subject.accuracy}% · {subject.correctAnswers}/{subject.answeredQuestions} answered</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-line" role="img" aria-label={`${subject.label}: ${subject.accuracy}% accuracy`}><div className="h-full bg-primary" style={{ width: `${Math.min(subject.accuracy, 100)}%` }} /></div>
        </li>)}</ul> : <p className="mt-3 text-small text-muted">Subject data will appear after you complete a practice session.</p>}
      </section>

      <section className="card p-5" aria-labelledby="progress-title">
        <h3 id="progress-title" className="text-heading">Progress over time</h3>
        {progress.length > 1 ? <div className="mt-4 flex h-40 items-end gap-2 border-b border-line pb-2" role="img" aria-label="Recent attempt percentages over time">
          {progress.map((item, index) => <div key={`${item.date}-${index}`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${item.subject}: ${item.percentage}% · ${new Date(item.date).toLocaleDateString()}`}>
            <span className="text-[10px] font-bold text-primary">{item.percentage}%</span>
            <div className="w-full max-w-8 rounded-t bg-primary" style={{ height: `${Math.max(item.percentage, 4)}%` }} />
            <span className="w-full truncate text-center text-[10px] text-muted">{new Date(item.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          </div>)}
        </div> : <p className="mt-3 text-small text-muted">Complete another practice attempt to see a meaningful progress trend.</p>}
      </section>
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card p-5" aria-labelledby="recent-activity-title">
        <div className="flex items-center justify-between gap-3"><h3 id="recent-activity-title" className="text-heading">Recent activity</h3><Link href="/practice/history" className="inline-flex items-center gap-1 text-small font-bold text-primary hover:underline">All history <ArrowRight size={14} aria-hidden /></Link></div>
        <ul className="mt-3 divide-y divide-line">{recentAttempts.map((attempt) => <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div><p className="font-bold">{attempt.subject?.label ?? "Practice"}</p><p className="text-small text-muted">{new Date(attempt.submittedAt ?? attempt.startedAt).toLocaleDateString()}</p></div>
          <div className="flex items-center gap-3"><span className="text-small font-bold">{attempt.score}/{attempt.totalPoints} · {attempt.percentage}%</span><Link className="text-small font-bold text-primary hover:underline" href={`/practice/history/${attempt.id}`}>Results</Link></div>
        </li>)}</ul>
      </section>
      <section className="card p-5" aria-labelledby="weak-topics-title">
        <h3 id="weak-topics-title" className="flex items-center gap-2 text-heading"><Target size={18} aria-hidden /> Topics to revisit</h3>
        {weakTopics.length ? <ul className="mt-3 flex flex-col gap-3">{weakTopics.map((topic) => <li key={topic.name} className="flex items-center justify-between gap-3 border-b border-line pb-3 last:border-0"><span className="font-bold">{topic.name}</span><span className="badge badge-warning">{topic.incorrect}/{topic.total} incorrect</span></li>)}</ul> : <p className="mt-3 text-small text-muted">Topic insights will appear when saved question data includes syllabus topics.</p>}
      </section>
    </div>
    <p className="text-caption">Statistics are calculated from your completed saved attempts.</p>
  </div>;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <article className="card p-4"><p className="text-caption">{label}</p><p className="mt-2 font-heading text-2xl font-extrabold text-primary">{value}</p>{hint ? <p className="mt-1 text-small text-muted">{hint}</p> : null}</article>;
}
