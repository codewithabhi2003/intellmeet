import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import Reveal from './Reveal';
import DemoVideo from './DemoVideo';
import { HERO_SOURCES } from './HeroMock';
import useThemeMode from './useThemeMode';
import '../../styles/landing.css';

/**
 * Features — tabbed showcase with YOUR real screens.
 * Tabs advance automatically every AUTO_MS (2 seconds) and loop forever. You can still click a tab
 * (or use ← → Home End): the words and the screenshot slide out and the next ones slide in,
 * in the direction you are moving.
 *
 * Autoplay pauses while the mouse is over the section or a tab/button has keyboard focus,
 * and only runs while the section is visible on screen.
 *
 * Screenshots live in `public/screenshots/`. Width/height are the files' natural size
 * (reserves space, and the CSS never stretches or crops them).
 * The "Video Meetings" tab plays the hero demo VIDEO for the active theme (same files as the hero, so the
 * browser reuses the download). It starts when the tab opens (even with reduce-motion, because the visitor chose it),
 * loops muted, shows a Play/Pause button, and pauses itself when scrolled away.
 * Only describe things the app really does — every bullet below matches a visible screen.
 */
const TABS = [
  {
    id: 'summary',
    label: 'AI Summaries',
    bullets: [
      ['Structured summaries:', 'decisions, discussion points, open questions and risks for every meeting.'],
      ['Your language:', 'choose the summary language and regenerate whenever you like.'],
      ['Tasks included:', 'action items from the discussion appear right beside the summary.'],
      ['Second pass:', 're-run the transcription with the right spoken language if you need to.'],
    ],
    image: { src: '/screenshots/meeting-summary.png', width: 873, height: 621, alt: 'IntellMeet meeting page with the AI summary, decisions, discussion points, open questions, risks, language settings and action items.' },
  },
  {
    id: 'transcript',
    label: 'Transcript & Translation',
    bullets: [
      ['Timestamped lines:', 'every sentence is tied to a moment in the meeting.'],
      ['Original or translated:', 'switch views anytime. Translations are labeled and the original is never changed.'],
      ['Search inside:', 'find any phrase in the transcript instantly.'],
      ['English and Hindi:', 'transcripts and summaries in the language your team uses.'],
    ],
    image: { src: '/screenshots/meeting-transcript.png', width: 822, height: 427, alt: 'IntellMeet transcript with timestamps, Original and Translated tabs and a search box.' },
  },
  {
    id: 'tasks',
    label: 'Action Items',
    bullets: [
      ['AI-extracted, you confirm:', 'items stay marked “Needs review” until you approve them.'],
      ['Owners and deadlines:', 'filled in only when someone actually said them.'],
      ['A real task board:', 'To do, In progress and Done, filtered by workspace.'],
      ['Back to the source:', '“View in meeting” jumps to the moment a task came from.'],
    ],
    image: { src: '/screenshots/meeting-tasks.png', width: 862, height: 362, alt: 'IntellMeet task board with To do, In progress and Done columns of AI-extracted action items.' },
  },
  {
    id: 'search',
    label: 'Ask Your Meetings',
    bullets: [
      ['Plain-language questions:', 'for example “What action items are still open?”'],
      ['Narrow the scope:', 'by date range, workspace or a single meeting.'],
      ['Answers in your language:', 'pick the language the answer is written in.'],
      ['Sources you can open:', 'answers use only meetings you can access, each with a citation.'],
    ],
    image: { src: '/screenshots/meeting-search.png', width: 745, height: 513, alt: 'IntellMeet search answering “What action items are still open?” with numbered citations and a sources list.' },
  },
  {
    id: 'meetings',
    label: 'Video Meetings',
    bullets: [
      ['Meet in one place:', 'group video with chat, reactions and a participants list.'],
      ['Screen share:', 'show your work without leaving the meeting.'],
      ['Consent-first recording:', 'the host confirms everyone has been told and participants see a clear notice.'],
      ['Everything flows on:', 'after the meeting you get the transcript, summary and tasks.'],
    ],
    image: { themed: true, video: true, width: 1280, height: 720, alt: 'An IntellMeet video meeting with four participants, live chat and meeting controls.' },
  },
];

const EASE = [0.22, 1, 0.36, 1];

// How long each tab stays on screen before moving to the next one (milliseconds). 2000 = 2 seconds.
const AUTO_MS = 2000;

export default function Features() {
  const [[active, dir], setState] = useState([0, 1]);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduce = useReducedMotion();
  const mode = useThemeMode();
  const rootRef = useRef(null);
  const seen = useInView(rootRef, { once: true, margin: '300px' }); // used to preload images
  const inView = useInView(rootRef); // live value: autoplay only runs while the section is visible
  const tabRefs = useRef([]);
  const tab = TABS[active];
  const paused = hovered || focused;

  // Warm the cache once the section is near, so slides never reveal a half-loaded image.
  useEffect(() => {
    if (!seen) return;
    TABS.forEach((t) => {
      const img = new Image();
      img.src = t.image.themed ? HERO_SOURCES[mode].poster : t.image.src;
    });
  }, [seen, mode]);

  // Auto-advance every AUTO_MS. The timer restarts whenever `active` changes,
  // so clicking a tab also gives that tab a full 2 seconds before moving on.
  useEffect(() => {
    if (paused || !inView) return undefined; // add `|| reduce` here if you want autoplay off for reduced-motion users
    const id = setTimeout(() => {
      setState(([i]) => [(i + 1) % TABS.length, 1]);
    }, AUTO_MS);
    return () => clearTimeout(id);
  }, [active, paused, inView]);

  const go = (i) => {
    const next = (i + TABS.length) % TABS.length;
    if (next === active) return;
    setState([next, next > active ? 1 : -1]);
  };
  const onKeyDown = (e) => {
    const map = { ArrowRight: active + 1, ArrowLeft: active - 1, Home: 0, End: TABS.length - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    go(map[e.key]);
    tabRefs.current[(map[e.key] + TABS.length) % TABS.length]?.focus();
  };

  // Slide distances; with reduced motion everything becomes a plain fade.
  const tx = reduce ? 0 : 56;
  const ix = reduce ? 0 : 110;
  const textV = {
    enter: (d) => ({ opacity: 0, x: d * tx }),
    center: { opacity: 1, x: 0, transition: { duration: 0.45, ease: EASE, staggerChildren: reduce ? 0 : 0.08 } },
    exit: (d) => ({ opacity: 0, x: d * -tx, transition: { duration: 0.2, ease: 'easeIn' } }),
  };
  const itemV = {
    enter: (d) => ({ opacity: 0, x: d * (reduce ? 0 : 30) }),
    center: { opacity: 1, x: 0, transition: { duration: 0.45, ease: EASE } },
  };
  const imageV = {
    enter: (d) => ({ opacity: 0, x: d * ix, scale: reduce ? 1 : 0.95 }),
    center: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.55, ease: EASE } },
    exit: (d) => ({ opacity: 0, x: d * -ix, scale: reduce ? 1 : 0.97, transition: { duration: 0.22, ease: 'easeIn' } }),
  };

  const media = tab.image;
  const source = HERO_SOURCES[mode] ?? HERO_SOURCES.dark;

  return (
    <section id="features" ref={rootRef} aria-labelledby="features-title" className="lp-section lp-clip scroll-mt-16 py-20 sm:py-24">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <Reveal from="right" className="text-center">
          <p className="lp-eyebrow">FEATURES</p>
          <h2 id="features-title" className="mx-auto mb-4 max-w-4xl font-display text-3xl font-extrabold leading-tight text-ink sm:text-4xl">
            Everything a meeting leaves behind, <span className="lp-gradient-text">made useful</span>
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-[17px] text-ink-soft">
            These are screens from the working IntellMeet app, not mock-ups.
          </p>
        </Reveal>

        <Reveal from="right" delay={0.08} duration={0.8}>
          {/* Pauses autoplay while the mouse is over this area or a control has keyboard focus */}
          <div
            onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            onFocus={(e) => e.target.matches(':focus-visible') && setFocused(true)}
            onBlur={() => setFocused(false)}
          >
            <div role="tablist" aria-label="IntellMeet features" className="lp-ftabs" onKeyDown={onKeyDown}>
              {TABS.map((t, i) => (
                <button
                  key={t.id}
                  ref={(el) => (tabRefs.current[i] = el)}
                  id={`ftab-${t.id}`}
                  role="tab"
                  type="button"
                  aria-selected={i === active}
                  aria-controls="features-panel"
                  tabIndex={i === active ? 0 : -1}
                  className="lp-ftab"
                  onClick={() => go(i)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div
              id="features-panel"
              role="tabpanel"
              aria-labelledby={`ftab-${tab.id}`}
              className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14"
            >
              {/* words */}
              <div className="order-2 min-w-0 lg:order-1 lg:min-h-[22rem]">
                <AnimatePresence mode="wait" initial={false} custom={dir}>
                  <motion.div key={tab.id} custom={dir} variants={textV} initial="enter" animate="center" exit="exit">
                    <ul className="lp-fbullets">
                      {tab.bullets.map(([lead, rest]) => (
                        <motion.li key={lead} custom={dir} variants={itemV}>
                          <strong>{lead}</strong> {rest}
                        </motion.li>
                      ))}
                    </ul>
                    <motion.div custom={dir} variants={itemV} className="mt-9">
                      <Link to="/register" className="btn-primary lp-btn-glow !inline-flex items-center gap-2 !px-7 !py-3 text-base">
                        Get Started Free
                        <ArrowRight size={18} aria-hidden />
                      </Link>
                    </motion.div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* screenshot */}
              <div className="order-1 min-w-0 lg:order-2">
                <div className="lp-fpanel">
                  <AnimatePresence mode="wait" initial={false} custom={dir}>
                    {media.video ? (
                      <DemoVideo
                        key={source.video}
                        src={source.video}
                        poster={source.poster}
                        label={media.alt}
                        autoPlay /* the visitor picked this tab, so it always starts */
                        className="lp-fshot lp-fshot--video bg-card"
                        custom={dir}
                        variants={imageV}
                        initial="enter"
                        animate="center"
                        exit="exit"
                      />
                    ) : (
                      <motion.img
                        key={media.src}
                        className="lp-fshot"
                        src={media.src}
                        alt={media.alt}
                        width={media.width}
                        height={media.height}
                        decoding="async"
                        custom={dir}
                        variants={imageV}
                        initial="enter"
                        animate="center"
                        exit="exit"
                      />
                    )}
                  </AnimatePresence>
                </div>
                <p className="mt-3 text-center text-xs text-ink-muted sm:hidden">Swipe sideways to see the full screen</p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}