import { Link } from 'react-router-dom';
import Logo from './Logo';
import Reveal from './Reveal';
import '../../styles/landing.css';

export default function LandingFooter() {
  return (
    <footer className="lp-footer border-t border-line px-4 py-10 sm:px-6">
      <Reveal from="fade" duration={0.8} amount={0.3} className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <a href="#top" className="lp-logo-link" aria-label="IntellMeet — back to top">
            <Logo size={30} />
          </a>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
            <a href="#features" className="hover:text-ink">Features</a>
            <a href="#how" className="hover:text-ink">How it works</a>
            <Link to="/login" className="hover:text-ink">Sign in</Link>
          </nav>
        </div>
        <div className="mt-6 flex flex-wrap justify-between gap-4 border-t border-line pt-6 text-sm text-ink-muted">
          <span>© IntellMeet</span>
          <span>Review your AI providers’ data terms before using confidential meetings.</span>
        </div>
      </Reveal>
    </footer>
  );
}