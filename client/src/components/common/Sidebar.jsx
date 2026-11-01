import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Building2, CheckSquare, LayoutDashboard, LogOut, Plus, Search, Settings, Video } from 'lucide-react';
import Avatar from './Avatar';
import { useAuth } from '../../hooks/useAuth';

// Single source of nav items. Settings and Logout live in the account block at the bottom.
export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/meetings/new', label: 'New meeting', icon: Plus },
  { to: '/meetings', label: 'Meetings', icon: Video, end: true },
  { to: '/search', label: 'Ask meetings', icon: Search },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/workspaces', label: 'Workspaces', icon: Building2 },
];

const linkClass = ({ isActive }) => `flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${isActive ? 'bg-accent-soft text-accent-text' : 'text-ink-soft hover:bg-input hover:text-ink'}`;

export default function Sidebar({ onNavigate }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try { await logout(); } finally { setBusy(false); }
    onNavigate?.();
    navigate('/', { replace: true });          // signed out: "/" is the landing page
  };

  return (
    <div className="flex h-full flex-col">
      <nav aria-label="Main" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate} className={linkClass}><Icon size={18} aria-hidden /> {label}</NavLink>
        ))}
      </nav>
      <nav aria-label="Account" className="flex flex-col gap-1 border-t border-line p-3">
        <div className="flex items-center gap-3 px-3 py-2">
          <Avatar user={user} size={36} />
          <span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{user?.name}</span><span className="block truncate text-xs text-ink-muted">{user?.email}</span></span>
        </div>
        <NavLink to="/settings" onClick={onNavigate} className={linkClass}><Settings size={18} aria-hidden /> Settings</NavLink>
        <button type="button" onClick={signOut} disabled={busy} className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-ink-soft transition-colors hover:bg-input hover:text-ink disabled:opacity-60">
          <LogOut size={18} aria-hidden /> {busy ? 'Signing out…' : 'Log out'}
        </button>
      </nav>
    </div>
  );
}
