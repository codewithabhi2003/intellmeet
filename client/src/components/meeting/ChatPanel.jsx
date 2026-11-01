import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { useSocket } from '../../hooks/useSocket';
import * as meetingService from '../../services/meetingService';

// Messages are rendered as plain text (React escapes them), so chat content can never inject markup.
export default function ChatPanel({ meetingId, selfUserId, joined, draft, onDraftChange }) {
  const { getSocket } = useSocket();
  const [messages, setMessages] = useState([]);
  const [localText, setLocalText] = useState('');
  const text = draft ?? localText;                       // controlled when the parent keeps the draft (it survives the panel closing)
  const setText = onDraftChange ?? setLocalText;
  const [error, setError] = useState('');
  const end = useRef(null);

  useEffect(() => { meetingService.messages(meetingId, { limit: 50 }).then(setMessages).catch(() => setError('Could not load earlier messages.')); }, [meetingId]);
  useEffect(() => {
    const socket = getSocket();
    const onMsg = (m) => setMessages((l) => (l.some((x) => x.id === m.id) ? l : [...l, m]));
    socket.on('chat:message', onMsg);
    return () => socket.off('chat:message', onMsg);
  }, [getSocket]);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [messages.length]);

  const send = (e) => {
    e.preventDefault();
    const t = text.trim(); if (!t || !joined) return;
    setError('');
    getSocket().emit('chat:send', { text: t }, (ack) => { if (!ack?.ok) setError(ack?.message || 'Message not sent.'); });
    setText('');
  };
  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" role="log" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 && <p className="py-6 text-center text-sm text-ink-muted">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.sender?.id === selfUserId ? 'items-end' : 'items-start'}`}>
            <span className="mb-0.5 text-xs text-ink-muted">{m.sender?.name}</span>
            <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm text-ink" style={{ background: m.sender?.id === selfUserId ? 'var(--accent-soft)' : 'var(--bg-input)' }}>{m.text}</p>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="border-t border-line p-3">
        <p role="alert" className="mb-1 min-h-[1rem] text-xs" style={{ color: 'var(--red-text)' }}>{error}</p>
        <div className="flex items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">Message</label>
          <textarea id="chat-input" rows={1} maxLength={2000} className="field resize-none" placeholder="Message everyone" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
          <button type="submit" className="btn-primary !px-4" disabled={!text.trim() || !joined} aria-label="Send message"><Send size={18} aria-hidden /></button>
        </div>
      </form>
    </div>
  );
}
