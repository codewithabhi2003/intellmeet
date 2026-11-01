import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import Logo from './Logo';
import '../../styles/landing.css';

const LINKS = [
  ['Features', '#features'],
  ['How it works', '#how'],
  ['Trust', '#trust'],
];

const NAV_HEIGHT = 64; // h-16 — keep in sync with `.lp-nav { margin-bottom }` in landing.css

export default function LandingNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false); // moved a little: soft, borderless veil behind the links
  const [pastHero, setPastHero] = useState(false); // hero is gone: solid bar + border
  const reduce = useReducedMotion();

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const hero = document.querySelector('.lp-hero');
      setScrolled(y > 8);
      // No hero on the page (nav reused elsewhere)? fall back to "solid as soon as you scroll".
      setPastHero(hero ? hero.getBoundingClientRect().bottom <= NAV_HEIGHT : y > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // Escape closes the mobile menu; leaving mobile width closes it too.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const mq = window.matchMedia('(min-width: 768px)');
    const onMq = (e) => e.matches && setOpen(false);
    window.addEventListener('keydown', onKey);
    mq.addEventListener('change', onMq);
    return () => {
      window.removeEventListener('keydown', onKey);
      mq.removeEventListener('change', onMq);
    };
  }, [open]);

  return (
    <header
      className="lp-nav sticky top-0 z-30"
      data-soft={scrolled}
      data-past={pastHero}
      data-open={open}
    >
      {/* Over the hero the bar has no background and no border, so it reads as part of the hero. */}
      <span aria-hidden className="lp-nav__veil bg-base" />
      <span aria-hidden className="lp-nav__bar bg-base border-b border-line" />

      <div className="relative mx-auto flex h-16 max-w-[1320px] items-center gap-4 px-4 sm:px-6">
        <a href="#top" className="lp-logo-link" aria-label="IntellMeet — back to top">
          <Logo size={38} />
        </a>

        <nav aria-label="Main" className="ml-auto hidden items-center gap-7 text-sm md:flex">
          {LINKS.map(([label, href]) => (
            <a key={href} href={href} className="lp-nav-link text-ink-soft hover:text-ink">
              {label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link to="/login" className="btn-secondary !hidden !min-h-[44px] !px-5 !py-2 md:!inline-flex">
            Sign in
          </Link>
          <Link to="/register" className="btn-primary !hidden !min-h-[44px] !px-5 !py-2 md:!inline-flex">
            Get started
          </Link>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-ink md:hidden"
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="landing-mobile-menu"
            className="absolute inset-x-0 top-full overflow-hidden border-t border-line bg-base shadow-lg md:hidden"
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <nav aria-label="Mobile" className="mx-auto flex max-w-[1320px] flex-col gap-1 px-4 py-4 sm:px-6">
              {LINKS.map(([label, href]) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-[44px] items-center rounded-xl px-3 text-base font-medium text-ink hover:bg-accent-soft"
                >
                  {label}
                </a>
              ))}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Link to="/login" onClick={() => setOpen(false)} className="btn-secondary !min-h-[44px] !justify-center">
                  Sign in
                </Link>
                <Link to="/register" onClick={() => setOpen(false)} className="btn-primary !min-h-[44px] !justify-center">
                  Get started
                </Link>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}