import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/common/AuthLayout';
import { useAuth } from '../hooks/useAuth';
import { errorMessage } from '../services/api';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = form.name.trim() && form.email && form.password.length >= 8;

  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await register(form); navigate('/', { replace: true }); }
    catch (err) { setError(errorMessage(err, 'Could not create the account.')); }
    finally { setBusy(false); }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Start with a personal workspace." footer={<>Already registered? <Link to="/login" className="font-semibold text-accent-text underline">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div><label className="label" htmlFor="name">Name</label><input id="name" autoComplete="name" required maxLength={80} className="field" value={form.name} onChange={set('name')} /></div>
        <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" required className="field" value={form.email} onChange={set('email')} /></div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="new-password" required minLength={8} aria-describedby="pw-hint" className="field" value={form.password} onChange={set('password')} />
          <p id="pw-hint" className="mt-1 text-xs text-ink-muted">At least 8 characters.</p>
        </div>
        <p role="alert" aria-live="polite" className="min-h-[1.25rem] text-sm" style={{ color: 'var(--red-text)' }}>{error}</p>
        <button type="submit" className="btn-primary w-full" disabled={busy || !valid}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
    </AuthLayout>
  );
}
