import { useEffect, useState } from 'react';
import { avatarSrc } from '../../lib/avatar';

// Profile picture, falling back to the first letter of the name (also if the image fails to load).
// Decorative (alt=""): the person's name is always shown next to it.
export default function Avatar({ user, size = 36, className = '' }) {
  const src = avatarSrc(user?.avatarUrl);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  const box = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (src && !failed) return <img src={src} alt="" width={size} height={size} onError={() => setFailed(true)} className={`shrink-0 rounded-full object-cover ${className}`} style={box} />;
  return <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${className}`} style={{ ...box, background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>{user?.name?.[0]?.toUpperCase() || '?'}</span>;
}
