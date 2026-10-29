import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Skeleton from './Skeleton';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="mx-auto max-w-5xl space-y-4 p-8" role="status" aria-label="Loading"><Skeleton height={40} width="40%" /><Skeleton height={220} /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}
