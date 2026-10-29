import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/common/AuthLayout';
import { useAuth } from '../hooks/useAuth';
import { errorMessage } from '../services/api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const from = useLocation().state?.from?.pathname || '/';
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await login(form); navigate(from, { replace: true }); }
    catch (err) { setError(errorMessage(err, 'Could not sign in.')); }
    finally { setBusy(false); }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your meetings." footer={<>New here? <Link to="/register" className="font-semibold text-accent-text underline">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" required className="field" value={form.email} onChange={set('email')} /></div>
        <div><label className="label" htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" required className="field" value={form.password} onChange={set('password')} /></div>
        <p role="alert" aria-live="polite" className="min-h-[1.25rem] text-sm" style={{ color: 'var(--red-text)' }}>{error}</p>
        <button type="submit" className="btn-primary w-full" disabled={busy || !form.email || !form.password}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </AuthLayout>
  );
}
