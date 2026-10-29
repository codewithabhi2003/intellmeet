import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/common/AppShell';
import ProtectedRoute from './components/common/ProtectedRoute';
import { useAuth } from './hooks/useAuth';
import { Skeleton } from './components/common/Skeleton';
const CreateMeeting = lazy(() => import('./pages/CreateMeeting'));
import Home from './pages/Home';
const MeetingDetail = lazy(() => import('./pages/MeetingDetail'));
const MeetingHistory = lazy(() => import('./pages/MeetingHistory'));
const MeetingRoom = lazy(() => import('./pages/MeetingRoom'));
const MeetingSearch = lazy(() => import('./pages/MeetingSearch'));
const Settings = lazy(() => import('./pages/Settings'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Workspaces = lazy(() => import('./pages/Workspaces'));
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import Register from './pages/Register';

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" replace /> : children;
}

const Fallback = () => <div className="space-y-4 p-6" role="status" aria-label="Loading page"><Skeleton height={36} width="40%" /><Skeleton height={240} /></div>;

export default function App() {
  return (
    <Suspense fallback={<Fallback />}>
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/" element={<Home />} />
      <Route path="/room/:roomCode" element={<ProtectedRoute><MeetingRoom /></ProtectedRoute>} />
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="meetings" element={<MeetingHistory />} />
        <Route path="meetings/new" element={<CreateMeeting />} />
        <Route path="meetings/:id" element={<MeetingDetail />} />
        <Route path="search" element={<MeetingSearch />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="workspaces" element={<Workspaces />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
