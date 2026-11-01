import FinalCta from '../components/landing/FinalCta';
import Features from '../components/landing/Features';
import Hero from '../components/landing/Hero';
import HowItWorks from '../components/landing/HowItWorks';
import LandingFooter from '../components/landing/LandingFooter';
import LandingNav from '../components/landing/LandingNav';
import Trust from '../components/landing/Trust';
import GlassPage from '../components/landing/GlassPage';

// Public marketing page, shown at "/" to signed-out visitors.
export default function Landing() {
  return (
    <GlassPage>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-elevated focus:px-4 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>

      <LandingNav />

      <main id="main">
        <Hero />
        <Features />
        <HowItWorks />
        <Trust />
        <FinalCta />
      </main>

      <LandingFooter />
    </GlassPage>
  );
}
