import { Link } from 'react-router-dom';
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="mono text-sm text-ink-muted">404</p>
      <h1 className="text-2xl font-extrabold text-ink">Page not found</h1>
      <Link to="/" className="btn-primary">Back to dashboard</Link>
    </div>
  );
}
