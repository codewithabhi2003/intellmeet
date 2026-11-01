import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarX2, Link2, Play, Plus, Trash2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import EmptyState from '../components/common/EmptyState';
import Modal from '../components/common/Modal';
import { Skeleton } from '../components/common/Skeleton';
import StatusBadge from '../components/common/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import * as meetingService from '../services/meetingService';
import * as workspaceService from '../services/workspaceService';
import { errorMessage } from '../services/api';
import { formatWhen } from '../lib/meetingForm';
import { copyText, meetingLink } from '../lib/meetingLink';

const PAGE = 15;

export default function MeetingHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ status: '', workspaceId: '' });
  const [page, setPage] = useState(1);
  const [workspaces, setWorkspaces] = useState([]);
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState(null);

  useEffect(() => { workspaceService.list().then(setWorkspaces).catch(() => {}); }, []);
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    const params = { page, limit: PAGE, ...(filters.status && { status: filters.status }), ...(filters.workspaceId && { workspaceId: filters.workspaceId }) };
    meetingService.list(params).then((data) => setState({ data, loading: false, error: '' })).catch((e) => setState({ data: null, loading: false, error: errorMessage(e) }));
  }, [page, filters]);
  useEffect(load, [load]);

  const setFilter = (k) => (e) => { setPage(1); setFilters((f) => ({ ...f, [k]: e.target.value })); };
  const joinByCode = async (e) => {
    e.preventDefault();
    const c = code.trim().split('/').pop();   // accepts a pasted invite link too
    navigate(`/room/${c}`);
  };
  const cancel = async (m) => { try { await meetingService.patch(m.id, { status: 'cancelled' }); toast.success('Meeting cancelled'); load(); } catch (e) { toast.error(errorMessage(e, 'Could not cancel.')); } };
  const del = async () => { try { await meetingService.remove(confirm.id); toast.success('Meeting deleted'); load(); } catch (e) { toast.error(errorMessage(e, 'Could not delete.')); } finally { setConfirm(null); } };
  const totalPages = state.data ? Math.max(1, Math.ceil(state.data.total / PAGE)) : 1;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-extrabold text-ink">Meetings</h1><p className="text-ink-soft">Everything you host, are invited to, or share a workspace with.</p></div>
        <Link to="/meetings/new" className="btn-primary"><Plus size={18} aria-hidden /> New meeting</Link>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="f-status">Status</label><select id="f-status" className="field" value={filters.status} onChange={setFilter('status')}><option value="">All</option>{['live', 'scheduled', 'ended', 'cancelled'].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></div>
        <div><label className="label" htmlFor="f-ws">Workspace</label><select id="f-ws" className="field" value={filters.workspaceId} onChange={setFilter('workspaceId')}><option value="">All</option>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
        <form onSubmit={joinByCode} className="ml-auto flex items-end gap-2">
          <div><label className="label" htmlFor="code">Join with a code or link</label><input id="code" className="field" value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <button type="submit" className="btn-secondary" disabled={!code.trim()}>Join</button>
        </form>
      </div>

      {state.loading && !state.data && <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} height={72} />)}</div>}
      {state.error && <div role="alert" className="space-y-2 text-sm"><p style={{ color: 'var(--red-text)' }}>{state.error}</p><button type="button" className="btn-secondary" onClick={load}>Retry</button></div>}
      {state.data?.meetings.length === 0 && <EmptyState icon={CalendarX2} title="No meetings found" text="Try different filters, or start a new meeting." action={<Link to="/meetings/new" className="btn-primary">New meeting</Link>} />}

      {state.data?.meetings.length > 0 && (
        <ul className="space-y-3" aria-live="polite">
          {state.data.meetings.map((m) => {
            const host = String(m.hostId) === String(user.id);
            return (
              <li key={m.id} className="bento-tile flex flex-wrap items-center gap-3 !p-4">
                <div className="min-w-0 flex-1"><p className="truncate font-semibold text-ink">{m.title}</p><p className="mono text-xs text-ink-muted">{formatWhen(m)}{host ? ' · You host' : ''}{(m.status === 'live' || m.status === 'scheduled') ? ` · Code ${m.roomCode}` : ''}</p></div>
                <StatusBadge status={m.status} />
                <div className="flex items-center gap-1">
                  {(m.status === 'live' || m.status === 'scheduled') && <button type="button" className="btn-icon" aria-label={`Copy link for ${m.title}`} onClick={async () => { (await copyText(meetingLink(m.roomCode))) ? toast.success('Meeting link copied') : toast.error('Could not copy the link'); }}><Link2 size={18} aria-hidden /></button>}
                  {(m.status === 'live' || (m.status === 'scheduled' && host)) && <Link to={`/room/${m.roomCode}`} className="btn-primary !px-4"><Play size={16} aria-hidden />{m.status === 'live' ? 'Join' : 'Start'}</Link>}
                  {m.status === 'ended' && <Link to={`/meetings/${m.id}`} className="btn-secondary !px-4">View</Link>}
                  {host && m.status === 'scheduled' && <button type="button" className="btn-icon" onClick={() => cancel(m)} aria-label={`Cancel ${m.title}`}><XCircle size={18} aria-hidden /></button>}
                  {host && <button type="button" className="btn-icon" onClick={() => setConfirm(m)} aria-label={`Delete ${m.title}`}><Trash2 size={18} aria-hidden /></button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {state.data && state.data.total > PAGE && (
        <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Pagination">
          <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="mono text-sm text-ink-soft">{page} / {totalPages}</span>
          <button type="button" className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </nav>
      )}

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Delete this meeting?">
        <p className="mb-4 text-sm text-ink-soft">“{confirm?.title}” and its transcript, translations and summaries will be removed for everyone. This cannot be undone.</p>
        <div className="flex gap-2"><button type="button" className="btn-primary" onClick={del}>Delete</button><button type="button" className="btn-secondary" onClick={() => setConfirm(null)}>Cancel</button></div>
      </Modal>
    </div>
  );
}