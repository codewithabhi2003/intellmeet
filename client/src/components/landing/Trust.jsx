import { Clock, UserCheck, History, ClipboardList } from 'lucide-react';
import Reveal from './Reveal';
import '../../styles/landing.css';

// Practical value only — no customer counts, logos, certifications or performance statistics.
const BENEFITS = [
  [Clock, 'Less time writing notes', 'The transcript, summary and action items are generated for you.'],
  [UserCheck, 'Clearer ownership', 'Owners and deadlines appear on action items whenever they were stated in the meeting.'],
  [History, 'Easier access to past talks', 'Ask a question and jump to the exact moment in the original meeting.'],
  [ClipboardList, 'Organized follow-ups', 'Tasks sit on a board and link back to the meeting they came from.'],
];

const POINTS = [
  ['Access is checked inside every search', "You only get answers from meetings you can open, never someone else's."],
  ['Nothing is invented', "Unknown owners, deadlines and decisions stay empty. If the records don't answer a question, it says so."],
  ["Clear about what it isn't", 'Transcripts are generated after the meeting, not live. Recordings and transcripts are stored on the server and are not end-to-end encrypted.'],
];

export default function Trust() {
  return (
    <section id="trust" aria-labelledby="trust-title" className="lp-section lp-clip scroll-mt-16 border-t border-line py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap gap-x-12 gap-y-10">
          <Reveal from="bottom" className="min-w-[280px] flex-1 basis-[360px]">
            <p className="lp-eyebrow">BUILT TO BE HONEST</p>
            <h2 id="trust-title" className="font-display text-3xl font-extrabold leading-tight text-ink sm:text-4xl">
              AI that shows its work, <span className="lp-gradient-text">and its limits</span>
            </h2>
            <p className="mt-5 max-w-md text-[17px] text-ink-soft">
              Meeting records are sensitive. IntellMeet is designed so you can check what the AI says and control who can see it.
            </p>
          </Reveal>

          <ul className="m-0 grid flex-1 basis-[440px] list-none grid-cols-1 gap-3.5 p-0">
            {POINTS.map(([t, d], i) => (
              <Reveal as="li" key={t} from="bottom" delay={0.1 + i * 0.1}>
                <div className="lp-card rounded-2xl border border-line bg-card px-5 py-4">
                  <strong className="block text-base text-ink">{t}</strong>
                  <span className="text-[15px] text-ink-soft">{d}</span>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>

        <ul className="m-0 mt-14 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map(([Icon, t, d], i) => (
            <Reveal as="li" key={t} from="bottom" delay={(i % 4) * 0.08}>
              <div className="lp-card rounded-3xl border border-line bg-card p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
                  <Icon size={20} strokeWidth={1.9} aria-hidden />
                </span>
                <h3 className="mb-1.5 mt-4 font-display text-lg font-bold text-ink">{t}</h3>
                <p className="text-[14.5px] text-ink-soft">{d}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
