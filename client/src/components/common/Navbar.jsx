import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, Menu, Search } from 'lucide-react';
import Avatar from './Avatar';
import Logo from '../landing/Logo'; // same logo as LandingNav — adjust this path to where Logo.jsx lives
import { useAuth } from '../../hooks/useAuth';

export default function Navbar({ onMenu }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line bg-base px-4">
      <button type="button" className="btn-icon lg:hidden" onClick={onMenu} aria-label="Open menu"><Menu size={22} aria-hidden /></button>
      {/* lp-logo-link gives the logo its hover/focus animation, exactly like on the landing page */}
      <Link to="/" className="lp-logo-link" aria-label="IntellMeet — home">
        <Logo size={36} />
      </Link>
      <div className="flex-1" />
      <Link to="/search" className="btn-icon" aria-label="Search meetings"><Search size={20} aria-hidden /></Link>
      <div className="relative" ref={ref}>
        <button type="button" className="btn-icon" aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" onClick={() => setOpen((o) => !o)}><Avatar user={user} size={36} /></button>
        {open && (
          <div role="menu" className="absolute right-0 mt-2 w-60 rounded-2xl border border-line-strong bg-elevated p-2 shadow-lg">
            <div className="px-3 py-2"><p className="truncate text-sm font-semibold text-ink">{user?.name}</p><p className="truncate text-xs text-ink-muted">{user?.email}</p></div>
            <button type="button" role="menuitem" className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 text-sm text-ink-soft hover:bg-input hover:text-ink" onClick={logout}>
              <LogOut size={16} aria-hidden /> Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}