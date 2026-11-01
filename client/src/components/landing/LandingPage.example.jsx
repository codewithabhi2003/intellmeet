import GlassPage from './GlassPage';
import LandingNav from './LandingNav';
import Hero from './Hero';
import MarqueeBelt from './MarqueeBelt';
import Features from './Features';
import HowItWorks from './HowItWorks';
import Trust from './Trust';
import FinalCta from './FinalCta';
import LandingFooter from './LandingFooter';

export default function LandingPage() {
  return (
    <GlassPage>
      <LandingNav />
      <main className="lp-page">
        <Hero />
        <MarqueeBelt />
        <Features />
        <HowItWorks />
        <Trust />
        <FinalCta />
      </main>
      <LandingFooter />
    </GlassPage>
  );
}