import AppShell from '../components/common/AppShell';
import { Skeleton } from '../components/common/Skeleton';
import { useAuth } from '../hooks/useAuth';
import Dashboard from './Dashboard';
import Landing from './Landing';

// "/" shows the landing page to visitors and the dashboard to signed-in users.
// While the session is being checked we show a neutral skeleton, so signed-in users never see a flash of the landing page.
export default function Home() {
  const { user, loading } = useAuth();
  if (loading) return <div className="mx-auto max-w-5xl space-y-4 p-8" role="status" aria-label="Loading"><Skeleton height={40} width="40%" /><Skeleton height={220} /></div>;
  return user ? <AppShell><Dashboard /></AppShell> : <Landing />;
}
