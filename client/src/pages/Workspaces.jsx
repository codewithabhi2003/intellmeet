import { useCallback, useEffect, useState } from 'react';
import { Crown, Trash2, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import Avatar from '../components/common/Avatar';
import EmptyState from '../components/common/EmptyState';
import Modal from '../components/common/Modal';
import { Skeleton } from '../components/common/Skeleton';
import { useAuth } from '../hooks/useAuth';
import * as workspaceService from '../services/workspaceService';
import { errorMessage } from '../services/api';

function WorkspaceCard({ ws, me, onChanged }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const myRole = ws.members.find((m) => m.userId?._id === me.id)?.role;
  const canManage = ['owner', 'admin'].includes(myRole);

  const add = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await workspaceService.addMember(ws.id, { email, role }); setEmail(''); toast.success('Member added'); onChanged(); }
    catch (err) { toast.error(errorMessage(err, 'Could not add that member.')); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    try { await workspaceService.removeMember(ws.id, confirm.userId._id); toast.success('Member removed'); onChanged(); }
    catch (err) { toast.error(errorMessage(err, 'Could not remove that member.')); }
    finally { setConfirm(null); }
  };

  return (
    <section className="bento-tile" aria-labelledby={`ws-${ws.id}`}>
      <h2 id={`ws-${ws.id}`} className="mb-1 text-lg font-bold text-ink">{ws.name}</h2>
      <p className="mb-4 text-xs text-ink-muted">Your role: {myRole}</p>
      <ul className="mb-4 space-y-1">
        {ws.members.map((m) => (
          <li key={m.userId?._id} className="flex min-h-[44px] items-center gap-3 rounded-xl px-2 text-sm">
            <Avatar user={m.userId} size={32} />
            <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{m.userId?.name}</span><span className="block truncate text-xs text-ink-muted">{m.userId?.email}</span></span>
            <span className="flex items-center gap-1 text-xs text-ink-soft">{m.role === 'owner' && <Crown size={12} aria-hidden />}{m.role}</span>
            {canManage && m.role !== 'owner' && !(m.role === 'admin' && myRole !== 'owner') && (
              <button type="button" className="btn-icon" onClick={() => setConfirm(m)} aria-label={`Remove ${m.userId?.name}`}><Trash2 size={16} aria-hidden /></button>
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2" noValidate>
          <div className="min-w-[180px] flex-1"><label className="label" htmlFor={`e-${ws.id}`}>Add by email</label><input id={`e-${ws.id}`} type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {myRole === 'owner' && <div><label className="label" htmlFor={`r-${ws.id}`}>Role</label><select id={`r-${ws.id}`} className="field" value={role} onChange={(e) => setRole(e.target.value)}><option value="member">Member</option><option value="admin">Admin</option></select></div>}
          <button type="submit" className="btn-secondary" disabled={!email || busy}><UserPlus size={16} aria-hidden /> Add</button>
        </form>
      )}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Remove member?">
        <p className="mb-4 text-sm text-ink-soft">{confirm?.userId?.name} will lose access to this workspace’s meetings and records.</p>
        <div className="flex gap-2"><button type="button" className="btn-primary" onClick={remove}>Remove</button><button type="button" className="btn-secondary" onClick={() => setConfirm(null)}>Cancel</button></div>
      </Modal>
    </section>
  );
}

export default function Workspaces() {
  const { user } = useAuth();
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: s.data === null, error: '' }));
    workspaceService.list().then((data) => setState({ data, loading: false, error: '' })).catch((e) => setState({ data: null, loading: false, error: errorMessage(e) }));
  }, []);
  useEffect(load, [load]);

  const create = async (e) => {
    e.preventDefault(); setCreating(true);
    try { await workspaceService.create(name.trim()); setName(''); toast.success('Workspace created'); load(); }
    catch (err) { toast.error(errorMessage(err, 'Could not create the workspace.')); }
    finally { setCreating(false); }
  };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Workspaces</h1>
      <p className="mb-6 text-ink-soft">Members of a workspace can see its meetings, transcripts and tasks.</p>
      <form onSubmit={create} className="mb-6 flex max-w-lg flex-wrap items-end gap-2" noValidate>
        <div className="min-w-[200px] flex-1"><label className="label" htmlFor="wsname">New workspace</label><input id="wsname" className="field" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <button type="submit" className="btn-primary" disabled={!name.trim() || creating}>Create</button>
      </form>
      {state.loading && <div className="grid gap-4 md:grid-cols-2"><Skeleton height={220} /><Skeleton height={220} /></div>}
      {state.error && <div role="alert" className="space-y-2 text-sm"><p style={{ color: 'var(--red-text)' }}>{state.error}</p><button type="button" className="btn-secondary" onClick={load}>Retry</button></div>}
      {state.data?.length === 0 && <EmptyState title="No workspaces yet" text="Create one above to start organizing meetings." />}
      {state.data && <div className="grid gap-4 md:grid-cols-2">{state.data.map((w) => <WorkspaceCard key={w.id} ws={w} me={user} onChanged={load} />)}</div>}
    </div>
  );
}
