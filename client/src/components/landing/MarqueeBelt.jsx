import { useState } from 'react';
import { Pause, Play } from 'lucide-react';
import '../../styles/landing.css';

/**
 * Continuous right-to-left text belt (pure CSS animation — no JS loop).
 *
 * Theme-aware border: the frame's border and text both use var(--text-primary), the same
 * variable your theme already flips (near-black in light mode, near-white in dark mode),
 * so it follows ThemeToggle automatically. Nothing here knows which theme is active.
 *
 * Seamless loop: the track holds two identical groups and animates by exactly -50%.
 */
const ITEMS = [
  'MEET SMARTER',
  'AI-POWERED SUMMARIES',
  'TIMESTAMPED TRANSCRIPTS',
  'SMART ACTION ITEMS',
  'SEARCHABLE MEETING KNOWLEDGE',
  'ENGLISH & HINDI',
  'LESS BUSYWORK',
  'BETTER COLLABORATION',
];

function Group({ hidden = false }) {
  return (
    <ul className="lp-belt__group m-0 list-none p-0" aria-hidden={hidden || undefined}>
      {ITEMS.map((text) => (
        <li key={text} className="lp-belt__item">
          {text}
          <span className="lp-belt__sep" aria-hidden />
        </li>
      ))}
    </ul>
  );
}

export default function MarqueeBelt() {
  const [paused, setPaused] = useState(false);

  return (
    <div className={`lp-belt ${paused ? 'is-paused' : ''}`} role="group" aria-label="IntellMeet highlights">
      <div className="lp-belt__frame">
        <div className="lp-belt__viewport">
          <div className="lp-belt__track">
            <Group />
            <Group hidden />
          </div>
        </div>
        <button
          type="button"
          className="lp-belt__toggle"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          aria-label={paused ? 'Play scrolling highlights' : 'Pause scrolling highlights'}
        >
          {paused ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />}
        </button>
      </div>
    </div>
  );
}
