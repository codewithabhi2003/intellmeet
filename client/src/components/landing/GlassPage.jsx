import AuroraBackground from './AuroraBackground';
import useThemeMode from './useThemeMode';
import "../../styles/glass.css";/**
 * Wrap the whole landing page (nav, <main>, footer) in this to turn on the glassmorphism look:
 *
 *   <GlassPage>
 *     <LandingNav />
 *     <main className="lp-page"> … </main>
 *     <LandingFooter />
 *   </GlassPage>
 *
 * It paints the scroll-linked aurora behind everything and switches the existing cards, frames, tabs,
 * belt and nav to frosted glass (see glass.css). Remove the wrapper (or the glass.css import) and the
 * previous look comes straight back — no component was changed to make this work.
 */
export default function GlassPage({ children }) {
  const mode = useThemeMode();
  return (
    <div className="lp-glass" data-mode={mode}>
      <AuroraBackground />
      {children}
    </div>
  );
}