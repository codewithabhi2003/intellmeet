import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import HeroMock from './HeroMock';
import Reveal from './Reveal';
import '../../styles/landing.css';

export default function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="lp-hero lp-clip relative scroll-mt-16">
      <div className="lp-hero-glow" aria-hidden />

      <div className="mx-auto grid max-w-[1320px] items-center gap-14 px-4 pb-20 pt-[7.5rem] sm:px-6 sm:pt-36 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-10">
        <div>
          <Reveal from="bottom" distance={16} delay={0}>
            <p className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-line-strong bg-card px-3.5 py-1.5 text-[12px] font-semibold tracking-[0.1em] text-accent-text">
              <span className="lp-dot-live" aria-hidden />
              AI-POWERED MEETING INTELLIGENCE
            </p>
          </Reveal>

          <Reveal from="bottom" distance={28} delay={0.08}>
            <h1
              id="hero-title"
              className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl xl:text-[3.25rem]"
            >
              <span className="block">Every Meeting.</span>
              <span className="block">
                Every <span className="lp-gradient-text">Insight.</span>
              </span>
              <span className="block">
                One <span className="lp-gradient-text">Intelligent Workspace.</span>
              </span>
            </h1>
          </Reveal>

          <Reveal from="bottom" distance={20} delay={0.2}>
            <p className="mt-6 max-w-xl text-lg text-ink-soft">
              Turn conversations into searchable knowledge, clear summaries, and actionable tasks. Let IntellMeet handle
              the details while your team focuses on what matters.
            </p>
          </Reveal>

          <Reveal from="bottom" distance={20} delay={0.32}>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/register" className="btn-primary lp-btn-glow !inline-flex items-center gap-2 !px-8 !py-3.5 text-base">
                Get Started Free
                <ArrowRight size={18} aria-hidden />
              </Link>
              <a
                href="#features"
                className="btn-secondary !px-8 !py-3.5 text-base"
                style={{ color: 'var(--text-primary)', borderColor: 'var(--border-strong)' }}
              >
                Explore Features
              </a>
            </div>
          </Reveal>

          <Reveal from="fade" delay={0.44}>
            <p className="mt-7 text-sm text-ink-muted">
              Consent-first recording · Originals are never modified · Every answer cites its source
            </p>
          </Reveal>
        </div>

        <Reveal from="bottom" distance={24} scale={0.96} delay={0.2} duration={0.8}>
          <HeroMock />
        </Reveal>
      </div>
    </section>
  );
}