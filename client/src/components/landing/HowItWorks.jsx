import { useRef } from 'react';
import { useInView } from 'framer-motion';
import Reveal from './Reveal';
import '../../styles/landing.css';

const STEPS = [
  ['01', 'Meet', 'Start or join a video meeting with your team, with chat and screen share. The host confirms consent before anything is recorded.'],
  ['02', 'Understand', 'After the meeting, generate the transcript, translate it, and produce a summary with decisions and action items.'],
  ['03', 'Take Action', 'Search your meeting knowledge, open the exact moment behind every answer, and follow up on tasks.'],
];

export default function HowItWorks() {
  // Drives the connecting line + node glow once the steps scroll into view.
  const listRef = useRef(null);
  const live = useInView(listRef, { once: true, amount: 0.35 });

  return (
    <section id="how" aria-labelledby="how-title" className="lp-section lp-clip scroll-mt-16 border-t border-line bg-surface py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal from="left">
          <p className="lp-eyebrow">HOW IT WORKS</p>
          <h2 id="how-title" className="mb-14 max-w-2xl font-display text-3xl font-extrabold leading-tight text-ink sm:text-4xl">
            From conversation to answers in <span className="lp-gradient-text">three steps</span>
          </h2>
        </Reveal>

        <ol ref={listRef} className={`lp-steps m-0 list-none p-0 ${live ? 'is-live' : ''}`}>
          <li className="lp-steps__line" aria-hidden="true">
            <span className="lp-steps__fill" />
          </li>
          {STEPS.map(([n, title, text], i) => (
            <Reveal as="li" key={n} from="left" delay={i * 0.14} className="lp-step">
              <span className="lp-step__node bg-card">{n}</span>
              <div className="lp-step__card rounded-3xl border border-line bg-card p-7">
                <h3 className="mb-2 font-display text-xl font-bold text-ink">{title}</h3>
                <p className="text-[15px] text-ink-soft">{text}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
