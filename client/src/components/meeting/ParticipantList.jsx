import { useState } from 'react';
import { Circle, DoorOpen, Mic, MicOff, MonitorUp, UserMinus, UserPlus, Video, VideoOff, VolumeX, X, Check } from 'lucide-react';
import Modal from '../common/Modal';
import MeetingLinkBox from './MeetingLinkBox';

const iconBtn = 'btn-icon !h-9 !w-9 disabled:opacity-40';

// The people panel. Everyone sees who is here (the host has a "Host" tag). Only the host gets controls:
// let people in from the waiting room, mute a microphone, turn a camera off, remove someone, or mute everyone.
// (The server enforces this too: the host is checked there on every action.)
export default function ParticipantList({ people, hostId, isHost = false, waiting = [], invite, onAdmit, onDeny, onMute, onMuteAll, onRemove }) {
  const [showInvite, setShowInvite] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const isHostPerson = (p) => String(p.userId) === String(hostId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isHost && waiting.length > 0 && (
          <section aria-labelledby="waiting-h" className="mb-4 rounded-2xl border p-3" style={{ borderColor: 'var(--accent-yellow)' }}>
            <h3 id="waiting-h" className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><DoorOpen size={16} aria-hidden />Waiting to join ({waiting.length})</h3>
            <ul className="space-y-1">
              {waiting.map((w) => (
                <li key={w.socketId} className="flex min-h-[44px] items-center gap-2 text-sm text-ink">
                  <span className="min-w-0 flex-1 truncate">{w.name}</span>
                  <button type="button" className="btn-primary !min-h-[36px] !px-3 !py-1 text-xs" onClick={() => onAdmit(w.socketId)} aria-label={`Let ${w.name} in`}><Check size={14} aria-hidden />Admit</button>
                  <button type="button" className="btn-secondary !min-h-[36px] !px-3 !py-1 text-xs" onClick={() => onDeny(w.socketId)} aria-label={`Do not let ${w.name} in`}><X size={14} aria-hidden />Deny</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <h3 className="mb-1 px-2 text-sm font-bold text-ink">Participants ({people.length})</h3>
        <ul aria-label="Participants">
          {people.map((p) => (
            <li key={p.key} className="flex min-h-[48px] items-center gap-2 rounded-xl px-2 text-sm text-ink">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }} aria-hidden>{p.name?.[0]?.toUpperCase()}</span>
              <span className="min-w-0 flex-1 truncate">
                {p.name}
                {p.isSelf && <span className="text-ink-muted"> (You)</span>}
                {isHostPerson(p) && <span className="ml-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>Host</span>}
              </span>
              {p.media.screen && <MonitorUp size={14} className="text-ink-muted" aria-label="Sharing screen" />}
              {p.media.recording && <Circle size={10} fill="currentColor" style={{ color: 'var(--red-text)' }} aria-label="Recording" />}
              {isHost && !p.isSelf ? (
                <>
                  <button type="button" className={iconBtn} disabled={!p.media.audio} onClick={() => onMute(p.key, 'audio')} aria-label={p.media.audio ? `Mute ${p.name}` : `${p.name} is muted`}>{p.media.audio ? <Mic size={16} aria-hidden /> : <MicOff size={16} aria-hidden />}</button>
                  <button type="button" className={iconBtn} disabled={!p.media.video} onClick={() => onMute(p.key, 'video')} aria-label={p.media.video ? `Turn off ${p.name}'s camera` : `${p.name}'s camera is off`}>{p.media.video ? <Video size={16} aria-hidden /> : <VideoOff size={16} aria-hidden />}</button>
                  <button type="button" className={iconBtn} onClick={() => setConfirm(p)} aria-label={`Remove ${p.name} from the meeting`}><UserMinus size={16} aria-hidden /></button>
                </>
              ) : (
                <>
                  {!p.media.audio && <MicOff size={14} className="text-ink-muted" aria-label="Muted" />}
                  {!p.media.video && !p.media.screen && <VideoOff size={14} className="text-ink-muted" aria-label="Camera off" />}
                </>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3 border-t border-line p-3">
        {showInvite && invite && (
          <div className="rounded-2xl border border-line bg-surface p-3">
            <MeetingLinkBox link={invite.link} code={invite.code} />
            <p className="mt-2 text-xs text-ink-muted">People can join with the link or by entering the code. Only people with access to this meeting can get in.</p>
          </div>
        )}
        <div className="flex gap-2">
          {invite && <button type="button" className="btn-secondary flex-1 !px-3" aria-expanded={showInvite} onClick={() => setShowInvite((s) => !s)}><UserPlus size={16} aria-hidden />Add people</button>}
          {isHost && <button type="button" className="btn-secondary flex-1 !px-3" onClick={onMuteAll}><VolumeX size={16} aria-hidden />Mute all</button>}
        </div>
      </div>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Remove from meeting?">
        <p className="mb-4 text-sm text-ink-soft">{confirm?.name} will be removed now and will not be able to rejoin this meeting.</p>
        <div className="flex gap-2">
          <button type="button" className="btn-primary" onClick={() => { onRemove(confirm.key); setConfirm(null); }}>Remove</button>
          <button type="button" className="btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}
