import { Mic, MicOff, MessageSquare, PhoneOff, Users, Video, VideoOff } from 'lucide-react';

const on = { background: 'var(--accent-soft)', color: 'var(--accent-text)' };
const off = { background: 'color-mix(in srgb, var(--accent-red) 16%, transparent)', color: 'var(--red-text)' };

// children: extra controls (screen share, recorder) rendered between the media toggles and the panels.
export default function MeetingControls({ audio, video, canVideo, onToggleAudio, onToggleVideo, panel, onPanel, unread = 0, waiting = 0, onLeave, children, endButton }) {
  return (
    <div role="toolbar" aria-label="Meeting controls" className="flex flex-wrap items-center justify-center gap-2 border-t border-line bg-base px-3 py-3">
      <button type="button" className="btn-icon" style={audio ? undefined : off} onClick={onToggleAudio} aria-pressed={!audio} aria-label={audio ? 'Mute microphone' : 'Unmute microphone'}>{audio ? <Mic size={20} aria-hidden /> : <MicOff size={20} aria-hidden />}</button>
      <button type="button" className="btn-icon" style={video ? undefined : off} onClick={onToggleVideo} disabled={!canVideo} aria-pressed={!video} aria-label={video ? 'Turn camera off' : 'Turn camera on'}>{video ? <Video size={20} aria-hidden /> : <VideoOff size={20} aria-hidden />}</button>
      {children}
      <button id="toggle-chat" type="button" className="btn-icon relative" style={panel === 'chat' ? on : undefined} onClick={() => onPanel('chat')} aria-expanded={panel === 'chat'} aria-controls="room-panel" aria-label={unread > 0 ? `Chat, ${unread} unread` : 'Chat'}>
        <MessageSquare size={20} aria-hidden />
        {unread > 0 && <span aria-hidden="true" data-testid="unread-badge" className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[11px] font-bold" style={{ background: 'var(--accent-red)', color: '#000' }}>{unread > 9 ? '9+' : unread}</span>}
      </button>
      <button id="toggle-people" type="button" className="btn-icon relative" style={panel === 'people' ? on : undefined} onClick={() => onPanel('people')} aria-expanded={panel === 'people'} aria-controls="room-panel" aria-label={waiting > 0 ? `Participants, ${waiting} waiting` : 'Participants'}>
        <Users size={20} aria-hidden />
        {waiting > 0 && <span aria-hidden="true" data-testid="waiting-badge" className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[11px] font-bold" style={{ background: 'var(--accent-yellow)', color: '#000' }}>{waiting > 9 ? '9+' : waiting}</span>}
      </button>
      <button type="button" className="btn-primary !px-5" style={{ background: 'var(--accent-red)', color: '#000' }} onClick={onLeave}><PhoneOff size={18} aria-hidden /> Leave</button>
      {endButton}
    </div>
  );
}