import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import Modal from '../components/common/Modal';
import { Skeleton } from '../components/common/Skeleton';
import TaskBoard from '../components/tasks/TaskBoard';
import * as taskService from '../services/taskService';
import * as workspaceService from '../services/workspaceService';
import { errorMessage } from '../services/api';

export default function Tasks() {
  const [sp, setSp] = useSearchParams();
  const review = sp.get('review') === '1';
  const [workspaceId, setWorkspaceId] = useState('');
  const [workspaces, setWorkspaces] = useState([]);
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [title, setTitle] = useState('');
  const [confirm, setConfirm] = useState(null);

  useEffect(() => { workspaceService.list().then(setWorkspaces).catch(() => {}); }, []);
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: s.data === null, error: '' }));
    taskService.list({ ...(workspaceId && { workspaceId }), ...(review && { needsReview: 'true' }), limit: 200 })
      .then((data) => setState({ data, loading: false, error: '' })).catch((e) => setState({ data: null, loading: false, error: errorMessage(e) }));
  }, [workspaceId, review]);
  useEffect(load, [load]);

  const membersFor = (wsId) => (workspaces.find((w) => w.id === wsId)?.members || []).map((m) => ({ id: m.userId?._id, name: m.userId?.name }));
  const update = async (id, patch) => {
    const prev = state.data;
    setState((s) => ({ ...s, data: s.data.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));      // optimistic, rolled back on failure
    try {
      const t = await taskService.update(id, patch);
      setState((s) => ({ ...s, data: s.data.map((x) => (x.id === id ? t : x)).filter((x) => !(review && !x.needsReview)) }));
    } catch (e) { setState((s) => ({ ...s, data: prev })); toast.error(errorMessage(e, 'Could not update the task.')); }
  };
  const create = async (e) => {
    e.preventDefault();
    const ws = workspaceId || workspaces[0]?.id;
    try { await taskService.create({ title: title.trim(), workspaceId: ws }); setTitle(''); load(); } catch (err) { toast.error(errorMessage(err, 'Could not create the task.')); }
  };
  const remove = async () => { try { await taskService.remove(confirm.id); toast.success('Task deleted'); load(); } catch (e) { toast.error(errorMessage(e, 'Could not delete.')); } finally { setConfirm(null); } };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Tasks</h1>
      <p className="mb-5 text-ink-soft">Action items from your workspaces. AI-extracted items stay marked “Needs review” until you confirm them.</p>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="tw">Workspace</label><select id="tw" className="field" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}><option value="">All</option>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-ink"><input type="checkbox" className="h-5 w-5 accent-[var(--btn-bg)]" checked={review} onChange={(e) => setSp(e.target.checked ? { review: '1' } : {})} />Needs review only</label>
        <form onSubmit={create} className="ml-auto flex items-end gap-2"><div><label className="label" htmlFor="nt">New task</label><input id="nt" className="field" maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} /></div><button type="submit" className="btn-primary" disabled={!title.trim() || !workspaces.length}>Add</button></form>
      </div>
      {state.loading && <div className="grid gap-4 md:grid-cols-3"><Skeleton height={240} /><Skeleton height={240} /><Skeleton height={240} /></div>}
      {state.error && <div role="alert" className="space-y-2 text-sm"><p style={{ color: 'var(--red-text)' }}>{state.error}</p><button type="button" className="btn-secondary" onClick={load}>Retry</button></div>}
      {state.data && <TaskBoard tasks={state.data} membersFor={membersFor} onUpdate={update} onDelete={setConfirm} />}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Delete this task?">
        <p className="mb-4 text-sm text-ink-soft">“{confirm?.title}” will be removed for everyone in the workspace.</p>
        <div className="flex gap-2"><button type="button" className="btn-primary" onClick={remove}>Delete</button><button type="button" className="btn-secondary" onClick={() => setConfirm(null)}>Cancel</button></div>
      </Modal>
    </div>
  );
}
