import { motion, useMotionTemplate, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import "../../styles/glass.css";
/**
 * Scroll-linked aurora background — pure CSS gradients + framer-motion (already in your project), no video,
 * no image files, no canvas.
 *
 *  - Four big soft colour orbs drift across the viewport as you scroll (GPU transforms only).
 *  - The whole palette slowly hue-shifts from section to section: indigo/cyan (hero) → violet/magenta
 *    (features) → teal/sky (how it works) → indigo again (trust + CTA).
 *  - A faint "voice wave" ribbon slides sideways with the scroll — the one product-specific touch.
 *  - A very light film grain keeps the gradients from banding behind the glass.
 *
 * It is `position: fixed` inside <GlassPage>, so it never affects layout, never causes scrolling,
 * and "prefers-reduced-motion" gets a still version of the same picture.
 */

const STOPS = [0, 0.25, 0.5, 0.75, 1];

// Speech-like waveform: a sine whose height swells and fades, like someone talking.
function wave(amp, freq, phase, w = 2400, h = 300) {
  let d = '';
  for (let x = 0; x <= w; x += 10) {
    const swell = (0.55 + 0.45 * Math.sin(x / 330 + phase * 2)) * (0.65 + 0.35 * Math.sin(x / 120 + phase));
    const y = h / 2 + amp * swell * Math.sin(x * freq + phase);
    d += `${x === 0 ? 'M' : 'L'}${x} ${y.toFixed(1)}`;
  }
  return d;
}
const WAVES = [
  { d: wave(70, 0.021, 0), o: 0.46 },
  { d: wave(52, 0.017, 2.1), o: 0.3 },
  { d: wave(38, 0.027, 4.2), o: 0.2 },
];

export default function AuroraBackground() {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const p = useSpring(scrollYProgress, { stiffness: 55, damping: 24, mass: 0.6 });

  const hue = useTransform(p, STOPS, [0, 38, -34, 22, -8]);
  const filter = useMotionTemplate`hue-rotate(${hue}deg)`;

  const o1 = {
    x: useTransform(p, STOPS, ['-26vw', '10vw', '48vw', '6vw', '38vw']),
    y: useTransform(p, STOPS, ['-16vh', '14vh', '36vh', '4vh', '30vh']),
    scale: useTransform(p, STOPS, [1, 1.2, 0.92, 1.15, 1]),
  };
  const o2 = {
    x: useTransform(p, STOPS, ['82vw', '58vw', '8vw', '70vw', '46vw']),
    y: useTransform(p, STOPS, ['6vh', '44vh', '14vh', '50vh', '8vh']),
    scale: useTransform(p, STOPS, [1, 0.9, 1.2, 0.95, 1.1]),
  };
  const o3 = {
    x: useTransform(p, STOPS, ['30vw', '80vw', '34vw', '62vw', '18vw']),
    y: useTransform(p, STOPS, ['78vh', '40vh', '70vh', '26vh', '64vh']),
    scale: useTransform(p, STOPS, [0.9, 1.15, 1, 1.25, 0.95]),
  };
  const o4 = {
    x: useTransform(p, STOPS, ['62vw', '24vw', '74vw', '20vw', '66vw']),
    y: useTransform(p, STOPS, ['60vh', '84vh', '34vh', '72vh', '40vh']),
    scale: useTransform(p, STOPS, [0.7, 0.9, 0.75, 1, 0.8]),
  };
  const waveX = useTransform(p, [0, 1], ['0vw', '-75vw']);
  const waveY = useTransform(p, STOPS, ['0vh', '-7vh', '5vh', '-5vh', '3vh']);

  // Reduced motion: same picture, frozen (no scroll linking, no drifting).
  const still = (x, y, s = 1) => ({ x, y, scale: s });

  return (
    <div className={`lp-aurora ${reduce ? 'is-still' : ''}`} aria-hidden>
      <motion.div className="lp-aurora__orbs" style={reduce ? undefined : { filter }}>
        <motion.div className="lp-au__orb lp-au__orb--1" style={reduce ? still('-26vw', '-16vh') : o1}>
          <i className="lp-au__blob" />
        </motion.div>
        <motion.div className="lp-au__orb lp-au__orb--2" style={reduce ? still('82vw', '6vh') : o2}>
          <i className="lp-au__blob" />
        </motion.div>
        <motion.div className="lp-au__orb lp-au__orb--3" style={reduce ? still('30vw', '78vh', 0.9) : o3}>
          <i className="lp-au__blob" />
        </motion.div>
        <motion.div className="lp-au__orb lp-au__orb--4" style={reduce ? still('62vw', '60vh', 0.7) : o4}>
          <i className="lp-au__blob" />
        </motion.div>
      </motion.div>

      <motion.svg
        className="lp-aurora__wave"
        viewBox="0 0 2400 300"
        preserveAspectRatio="none"
        style={reduce ? undefined : { x: waveX, y: waveY }}
      >
        {WAVES.map((w, i) => (
          <path
            key={i}
            d={w.d}
            fill="none"
            stroke="currentColor"
            strokeOpacity={w.o}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </motion.svg>

      <div className="lp-aurora__grain" />
    </div>
  );
}