import { Link } from 'react-router-dom';
import { Globe2, ListChecks, Search, Video } from 'lucide-react';
import { BentoGrid, BentoTile } from './BentoGrid';
import Logo from '../landing/Logo'; // same logo as LandingNav — adjust this path to where Logo.jsx lives

const FEATURES = [
  { icon: Video, title: 'Video meetings', text: 'WebRTC calls with screen share and chat.', size: 'wide' },
  { icon: Globe2, title: 'English + Hindi', text: 'Transcripts, translations and summaries in your language.' },
  { icon: Search, title: 'Ask your meetings', text: 'Answers with citations that open the original moment.' },
  { icon: ListChecks, title: 'Action items', text: 'Extracted for review. Nothing is assigned by guesswork.', size: 'wide' },
];

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen bg-base">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-8 lg:grid-cols-2">
        <section aria-label="Product overview" className="order-2 lg:order-1">
          {/* lp-logo-link gives the logo its hover/focus animation, exactly like on the landing page */}
          <div className="mb-6">
            <Link to="/" className="lp-logo-link" aria-label="IntellMeet — home">
              <Logo size={44} />
            </Link>
          </div>
          <p className="mb-6 max-w-md text-ink-soft">Every meeting understood in every language, and never forgotten.</p>
          <BentoGrid className="bento-compact">
            {FEATURES.map(({ icon: Icon, title: t, text, size }) => (
              <BentoTile key={t} size={size} as="div">
                <Icon size={20} className="mb-3 text-accent-text" aria-hidden />
                <h3 className="text-sm font-bold text-ink">{t}</h3>
                <p className="mt-1 text-sm text-ink-soft">{text}</p>
              </BentoTile>
            ))}
          </BentoGrid>
        </section>
        <main className="order-1 lg:order-2">
          <div className="mx-auto w-full max-w-md rounded-3xl border border-line bg-card p-6 shadow-md sm:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div><h1 className="text-2xl font-extrabold text-ink">{title}</h1><p className="mt-1 text-sm text-ink-soft">{subtitle}</p></div>
            </div>
            {children}
            <p className="mt-6 text-center text-sm text-ink-soft">{footer}</p>
          </div>
        </main>
      </div>
    </div>
  );
}