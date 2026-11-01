import { motion, useReducedMotion } from 'framer-motion';

const SIZE = { hero: 'tile-hero', wide: 'tile-wide', tall: 'tile-tall', full: 'tile-full', default: '' };

export function BentoGrid({ children, className = '', ...rest }) {
  return (
    <motion.div className={`bento ${className}`} initial="hidden" animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }} {...rest}>
      {children}
    </motion.div>
  );
}

// The outer element animates (fade + 12px slide-up); the inner one owns hover lift, so the two transforms never fight.
export function BentoTile({ size = 'default', className = '', children, as: Tag = 'section', ...rest }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={`${SIZE[size]} min-w-0`}
      variants={{ hidden: { opacity: 0, y: reduce ? 0 : 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } } }}>
      <Tag className={`bento-tile h-full ${className}`} {...rest}>{children}</Tag>
    </motion.div>
  );
}
