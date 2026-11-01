import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Reveal from './Reveal';
import '../../styles/landing.css';

export default function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="lp-section lp-clip px-4 py-20 sm:px-6 sm:py-24">
      <Reveal from="bottom" duration={0.8} className="mx-auto max-w-6xl">
        <div className="lp-cta rounded-[28px] border border-line-strong bg-card px-6 py-16 text-center sm:py-20">
          <h2 id="cta-title" className="mx-auto max-w-2xl font-display text-3xl font-extrabold leading-tight text-ink sm:text-5xl">
            Make Every Meeting <span className="lp-gradient-text">Count.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[17px] text-ink-soft">
            Turn conversations into clarity, decisions, and action with IntellMeet.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link to="/register" className="btn-primary lp-btn-glow !inline-flex items-center gap-2 !px-8 !py-3.5 text-base">
              Get Started Free
              <ArrowRight size={18} aria-hidden />
            </Link>
            <a
              href="#features"
              className="btn-secondary !px-8 !py-3.5 text-base"
              style={{ color: 'var(--text-primary)', borderColor: 'var(--border-strong)' }}
            >
              Explore IntellMeet
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
