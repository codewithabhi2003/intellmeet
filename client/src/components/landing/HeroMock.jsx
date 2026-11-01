import { useReducedMotion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import DemoVideo from './DemoVideo';
import useThemeMode from './useThemeMode';
import '../../styles/landing.css';

/**
 * Hero media: your real IntellMeet meeting demo, framed with a restrained glow.
 *
 * Put the files in your Vite `public/videos/` folder (or change the paths below / pass `sources`).
 * One <video> element only — the source switches with the active theme
 * (dark-UI recording in dark mode, light-UI recording in light mode).
 * If you only have one video, point both keys at it.
 *
 * With "reduce motion" turned on in the OS it waits on the poster with a big Play button.
 */
export const HERO_SOURCES = {
  dark: { video: '/videos/intellmeet-hero-dark.mp4', poster: '/videos/intellmeet-hero-dark.jpg' },
  light: { video: '/videos/intellmeet-hero-light.mp4', poster: '/videos/intellmeet-hero-light.jpg' },
};

export default function HeroMock({ sources = HERO_SOURCES }) {
  const mode = useThemeMode();
  const reduceMotion = useReducedMotion();
  const active = sources[mode] ?? sources.dark;

  return (
    <figure className="lp-media m-0">
      <span className="lp-orb lp-orb--a" aria-hidden />
      <span className="lp-orb lp-orb--b" aria-hidden />

      <div className="lp-frame bg-card">
        <DemoVideo
          key={active.video}
          src={active.video}
          poster={active.poster}
          autoPlay={!reduceMotion}
          label="IntellMeet video meeting with a four-person grid, live chat, reactions and meeting controls"
        />
      </div>

      <span className="lp-chip lp-chip--live border border-line-strong bg-card text-ink" aria-hidden>
        <span className="lp-dot-live lp-dot-live--green" />
        Live Meeting
      </span>
      <span className="lp-chip lp-chip--ai border border-line-strong bg-card text-ink" aria-hidden>
        <Sparkles size={14} className="text-accent-text" />
        AI Summary Ready
      </span>

      <figcaption className="sr-only">A recorded demonstration of an IntellMeet video meeting.</figcaption>
    </figure>
  );
}