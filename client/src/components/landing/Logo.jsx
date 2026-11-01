import { useId } from 'react';
import '../../styles/landing.css';

/**
 * IntellMeet logo.
 *
 * The mark is a speech bubble (the meeting) holding "im" (IntellMeet). The dot of the "i" is a four-point
 * spark (the intelligence) and the arches of the "m" read as a voice wave (the conversation it listens to).
 *
 *   <Logo />                       mark + wordmark (nav / footer)
 *   <Logo size={28} />             smaller
 *   <LogoMark size={40} title="IntellMeet" />   mark only (login page, sidebar, loading screens …)
 *
 * Brand colours are fixed (indigo → violet → cyan) so the mark looks identical in light and dark themes.
 * Put the component inside <a>/<Link> yourself; hover/focus animation is picked up from `.lp-logo-link`.
 */

const BODY =
  'M16 3H32A14 14 0 0 1 46 17V24A14 14 0 0 1 32 38H21.5L11.4 45.3Q9.3 46.8 9.5 44.2L10.2 36.5A14 14 0 0 1 2 24V17A14 14 0 0 1 16 3Z';
const LETTERS =
  'M12.2 19.3V32.2M20.6 19.3V32.2M20.6 25.7A4 5.4 0 0 1 28.6 25.7V32.2M28.6 25.7A4 5.4 0 0 1 36.6 25.7V32.2';
const SPARK = 'M12.2 6.1Q13.1 10.5 17.5 11.4Q13.1 12.3 12.2 16.7Q11.3 12.3 6.9 11.4Q11.3 10.5 12.2 6.1Z';

export function LogoMark({ size = 36, title, className = '' }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const fill = `lm-fill-${uid}`;
  const gloss = `lm-gloss-${uid}`;
  const labelled = Boolean(title);

  return (
    <svg
      className={`lp-logo__mark ${className}`}
      width={size}
      height={size}
      viewBox="1 2 46 46"
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={fill} x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5B5BF0" />
          <stop offset="0.55" stopColor="#7C5CF2" />
          <stop offset="1" stopColor="#1FC8E8" />
        </linearGradient>
        <linearGradient id={gloss} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.3" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={BODY} fill={`url(#${fill})`} />
      <path d={BODY} fill={`url(#${gloss})`} />
      <path
        d={LETTERS}
        fill="none"
        stroke="#fff"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path className="lp-logo__spark" d={SPARK} fill="#fff" />
    </svg>
  );
}

export default function Logo({ size = 36, wordmark = true, className = '' }) {
  return (
    <span className={`lp-logo ${className}`}>
      <LogoMark size={size} />
      {wordmark && (
        <span className="lp-logo__word font-display font-extrabold text-ink" style={{ fontSize: `${size * 0.56}px` }}>
          Intell<span className="lp-gradient-text">Meet</span>
        </span>
      )}
    </span>
  );
}