import { useSyncExternalStore } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Reveal — the single scroll-triggered entrance primitive used by every landing section.
 *
 *   <Reveal from="right">…</Reveal>          slides in from the right
 *   <Reveal from="left" delay={0.1}>…</Reveal>
 *   <Reveal from="bottom" scale={0.96}>…</Reveal>
 *   <Reveal from="fade">…</Reveal>           opacity only
 *   <Reveal as="li" …>                       renders a motion.li (any HTML tag works)
 *
 * - Plays when the element first enters the viewport (scroll down OR up), then stays put,
 *   so fast scrolling can never leave a section blank or re-hide content.
 * - Distances shrink on small screens; with prefers-reduced-motion it is a short fade only.
 * - Keep the animated element free of its own CSS transform (put hover transforms on a child).
 */
const EASE = [0.22, 1, 0.36, 1];

// One shared media query for every Reveal on the page (instead of one listener each).
const mql = typeof window !== 'undefined' ? window.matchMedia('(max-width: 640px)') : null;
const subscribe = (cb) => {
  mql?.addEventListener('change', cb);
  return () => mql?.removeEventListener('change', cb);
};
const useIsSmall = () => useSyncExternalStore(subscribe, () => !!mql?.matches, () => false);

export default function Reveal({
  as = 'div',
  from = 'bottom',
  delay = 0,
  duration = 0.7,
  distance,
  scale = 1,
  amount = 0.15,
  className,
  children,
  ...rest
}) {
  const reduce = useReducedMotion();
  const small = useIsSmall();
  const Tag = motion[as] ?? motion.div;

  const d = distance ?? (small ? 20 : 48);
  const offset = {
    left: { x: -d, y: 0 },
    right: { x: d, y: 0 },
    bottom: { x: 0, y: d },
    fade: { x: 0, y: 0 },
  }[from] ?? { x: 0, y: d };

  const variants = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2, delay } } }
    : {
        hidden: { opacity: 0, ...offset, scale },
        show: { opacity: 1, x: 0, y: 0, scale: 1, transition: { duration, delay, ease: EASE } },
      };

  return (
    <Tag
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount, margin: '0px 0px -6% 0px' }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
