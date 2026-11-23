import Link from "next/link";
import { ArrowRight, Library } from "lucide-react";

export function WelcomeSection() {
  return (
    <section className="rounded-[14px] bg-primary p-6 text-white md:p-10">
      <p className="text-caption text-mint">MDCAT preparation</p>
      <h2 className="mt-2 max-w-2xl font-heading text-3xl font-extrabold leading-tight text-white md:text-4xl">
        Welcome to MDCAT Arena
      </h2>
      <p className="mt-4 max-w-2xl text-base text-white/85">
        Practice subject by subject with questions mapped to the PM&amp;DC syllabus.
        Answer, submit and review the explanation behind every question.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/practice" className="btn btn-accent btn-lg">
          Start Practicing
          <ArrowRight size={18} aria-hidden />
        </Link>
        <Link
          href="#subjects"
          className="btn btn-lg border-white/60 text-white hover:bg-white/10"
        >
          <Library size={18} aria-hidden />
          Explore Subjects
        </Link>
      </div>
    </section>
  );
}
