import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import RoomLayout from '../src/components/meeting/RoomLayout';
import VideoGrid from '../src/components/meeting/VideoGrid';
import MeetingControls from '../src/components/meeting/MeetingControls';
import ChatPanel from '../src/components/meeting/ChatPanel';
import { SocketContext } from '../src/context/SocketContext';
import * as meetingService from '../src/services/meetingService';

vi.mock('../src/services/meetingService', () => ({ messages: vi.fn() }));
beforeEach(() => { cleanup(); vi.clearAllMocks(); meetingService.messages.mockResolvedValue([]); });

// RoomLayout with simple stand-ins; `panel` is held in state like the real page does.
function Harness({ initial = null, onCloseSpy = () => {}, chat = <div data-testid="chat-body">chat</div> }) {
  const [panel, setPanel] = useState(initial);
  return <RoomLayout header={<header>top bar</header>} notices={null} stage={<div data-testid="stage">video</div>} overlay={<div data-testid="overlay" />}
    panel={panel} onPanel={setPanel} onClose={(from) => { onCloseSpy(from); setPanel(null); }} chat={chat} people={<ul data-testid="people-body"><li>Ana</li></ul>}
    controls={<div role="toolbar" aria-label="Meeting controls"><button type="button" onClick={() => setPanel((p) => (p === 'chat' ? null : 'chat'))}>toggle</button></div>} />;
}
const panelEl = () => screen.queryByRole('complementary', { name: /chat|participants/i });

describe('RoomLayout: chat closed = the meeting takes the full page', () => {
  it('closed by default: only the top bar, the video stage and the bottom bar; no side panel at all', () => {
    const { container } = render(<Harness />);
    expect(screen.getByText('top bar')).toBeTruthy(); expect(screen.getByTestId('stage')).toBeTruthy(); expect(screen.getByRole('toolbar', { name: 'Meeting controls' })).toBeTruthy();
    expect(panelEl()).toBeNull(); expect(container.querySelector('aside')).toBeNull(); expect(screen.queryByTestId('panel-backdrop')).toBeNull();
    expect(screen.getByRole('main').contains(screen.getByTestId('stage'))).toBe(true); expect(screen.getByRole('main').contains(screen.getByTestId('overlay'))).toBe(true);
  });
  it('the stage and the whole room use the full viewport height (dynamic viewport units), with the bars pinned top and bottom', () => {
    const { container } = render(<Harness />);
    expect(container.firstChild.className).toMatch(/\bh-dvh\b/); expect(container.firstChild.className).toMatch(/flex-col/);
    expect(screen.getByRole('main').className).toMatch(/flex-1/); expect(screen.getByTestId('stage').parentElement.className).toMatch(/h-full/);
  });
});

describe('RoomLayout: chat open = a tab on the right', () => {
  it('opens a labeled panel on the right with the chat inside, over the video on small screens and beside it on large ones', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('toggle'));
    const aside = await screen.findByRole('complementary', { name: 'Chat' });
    expect(aside.className).toMatch(/\bright-0\b/); expect(aside.className).toMatch(/\bfixed\b/); expect(aside.className).toMatch(/lg:static/); expect(aside.className).toMatch(/lg:w-\[360px\]/);
    expect(within(aside).getByTestId('chat-body')).toBeTruthy(); expect(aside.id).toBe('room-panel');
    expect(screen.getByTestId('panel-backdrop').className).toMatch(/lg:hidden/);        // the dimmed backdrop only exists on small screens
    expect(screen.getByTestId('stage')).toBeTruthy();                                   // the video is still there
  });
  it('the close button closes it (and reports which panel, so focus can go back to its button)', async () => {
    const spy = vi.fn(); render(<Harness initial="chat" onCloseSpy={spy} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Close panel' }));
    expect(spy).toHaveBeenCalledWith('chat'); await waitFor(() => expect(panelEl()).toBeNull());
  });
  it('Escape closes it; a click on the backdrop closes it; an Escape the reaction picker already handled does not', async () => {
    const spy = vi.fn(); render(<Harness initial="chat" onCloseSpy={spy} />);
    await screen.findByRole('complementary', { name: 'Chat' });
    const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }); handled.preventDefault(); document.dispatchEvent(handled);
    expect(spy).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' }); expect(spy).toHaveBeenCalledTimes(1); await waitFor(() => expect(panelEl()).toBeNull());
    fireEvent.click(screen.getByText('toggle')); await screen.findByRole('complementary', { name: 'Chat' });
    fireEvent.click(screen.getByTestId('panel-backdrop')); expect(spy).toHaveBeenCalledTimes(2); await waitFor(() => expect(panelEl()).toBeNull());
  });
  it('switches between Chat and Participants without losing the chat (its state is kept)', async () => {
    function Stateful() { const [t, setT] = useState(''); return <input aria-label="draft" value={t} onChange={(e) => setT(e.target.value)} />; }
    render(<Harness initial="chat" chat={<Stateful />} />);
    const draft = await screen.findByLabelText('draft'); fireEvent.change(draft, { target: { value: 'half-typed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Participants' }));
    expect(await screen.findByRole('complementary', { name: 'Participants' })).toBeTruthy(); expect(screen.getByTestId('people-body')).toBeTruthy();
    expect(screen.getByLabelText('draft', { hidden: true }).value).toBe('half-typed');
    fireEvent.click(screen.getByRole('button', { name: 'Chat' })); expect(screen.queryByTestId('people-body')).toBeNull();
    expect(screen.getByRole('button', { name: 'Chat' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('VideoGrid fills the page', () => {
  const tile = (key, extra = {}) => ({ key, stream: null, name: key, isSelf: key === 'me', media: { audio: true, video: false, screen: false, recording: false }, ...extra });
  it('tiles share ALL the available height and are not fixed 16:9 boxes', () => {
    const { container } = render(<VideoGrid tiles={[tile('me'), tile('ana')]} />);
    const grid = container.firstChild; expect(grid.className).toMatch(/\bh-full\b/); expect(grid.className).toMatch(/auto-rows-fr/); expect(grid.className).toMatch(/sm:grid-cols-2/);
    expect(container.innerHTML).not.toMatch(/aspect-video/); expect(grid.children).toHaveLength(2);
    for (const t of grid.children) expect(t.className).toMatch(/\bh-full\b/);
  });
  it('one participant gets the whole stage; six get a 3-column grid', () => {
    const { container, rerender } = render(<VideoGrid tiles={[tile('me')]} />);
    expect(container.firstChild.className).toMatch(/grid-cols-1/); expect(container.firstChild.className).not.toMatch(/sm:grid-cols-2/);
    rerender(<VideoGrid tiles={['me', 'a', 'b', 'c', 'd', 'e'].map((k) => tile(k))} />); expect(container.firstChild.className).toMatch(/lg:grid-cols-3/);
  });
  it('a screen share is pinned large with the others in a strip', () => {
    const { container } = render(<VideoGrid tiles={[tile('me'), tile('ana', { media: { audio: true, video: true, screen: true, recording: false } }), tile('raj')]} />);
    expect(container.firstChild.className).toMatch(/lg:grid-cols-\[minmax\(0,1fr\)_220px\]/); expect(container.querySelectorAll('.aspect-video')).toHaveLength(2);   // the two others are small strip tiles
    expect(screen.getByLabelText("ana's video")).toBeTruthy();
  });
});

describe('MeetingControls: chat button', () => {
  const props = { audio: true, video: true, canVideo: true, onToggleAudio() {}, onToggleVideo() {}, onLeave() {} };
  it('is a disclosure button: aria-expanded follows the panel and it points at the panel it controls', () => {
    const { rerender } = render(<MeetingControls {...props} panel={null} onPanel={() => {}} />);
    const chat = screen.getByRole('button', { name: 'Chat' });
    expect(chat.getAttribute('aria-expanded')).toBe('false'); expect(chat.getAttribute('aria-controls')).toBe('room-panel'); expect(chat.id).toBe('toggle-chat');
    rerender(<MeetingControls {...props} panel="chat" onPanel={() => {}} />); expect(screen.getByRole('button', { name: 'Chat' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Participants' }).getAttribute('aria-expanded')).toBe('false');
  });
  it('shows an unread badge (capped at 9+) and names the count for screen readers; none when zero', () => {
    const { rerender } = render(<MeetingControls {...props} panel={null} onPanel={() => {}} unread={0} />);
    expect(screen.queryByTestId('unread-badge')).toBeNull();
    rerender(<MeetingControls {...props} panel={null} onPanel={() => {}} unread={3} />);
    expect(screen.getByTestId('unread-badge').textContent).toBe('3'); expect(screen.getByRole('button', { name: 'Chat, 3 unread' })).toBeTruthy();
    rerender(<MeetingControls {...props} panel={null} onPanel={() => {}} unread={12} />); expect(screen.getByTestId('unread-badge').textContent).toBe('9+');
  });
  it('clicking Chat / Participants reports which one', () => {
    const onPanel = vi.fn(); render(<MeetingControls {...props} panel={null} onPanel={onPanel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chat' })); fireEvent.click(screen.getByRole('button', { name: 'Participants' }));
    expect(onPanel.mock.calls.map((c) => c[0])).toEqual(['chat', 'people']);
  });
});

describe('ChatPanel keeps a half-typed message when the panel is closed and reopened', () => {
  const socket = { on() {}, off() {}, emit: vi.fn((ev, p, cb) => cb?.({ ok: true })) };
  const withSocket = (ui) => <SocketContext.Provider value={{ getSocket: () => socket }}>{ui}</SocketContext.Provider>;
  it('uses the draft from its parent (controlled), reports typing, and clears it after sending', async () => {
    const onDraft = vi.fn();
    const { unmount } = render(withSocket(<ChatPanel meetingId="m1" selfUserId="me" joined draft="hello th" onDraftChange={onDraft} />));
    expect((await screen.findByLabelText('Message')).value).toBe('hello th');
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'hello there' } }); expect(onDraft).toHaveBeenLastCalledWith('hello there');
    unmount();                                                                                   // panel closed
    render(withSocket(<ChatPanel meetingId="m1" selfUserId="me" joined draft="hello there" onDraftChange={onDraft} />));   // panel reopened
    expect((await screen.findByLabelText('Message')).value).toBe('hello there');
    fireEvent.keyDown(screen.getByLabelText('Message'), { key: 'Enter' });
    expect(socket.emit).toHaveBeenCalledWith('chat:send', { text: 'hello there' }, expect.any(Function)); expect(onDraft).toHaveBeenLastCalledWith('');
  });
  it('still works on its own (uncontrolled) when no draft is provided', async () => {
    render(withSocket(<ChatPanel meetingId="m1" selfUserId="me" joined />));
    const box = await screen.findByLabelText('Message'); fireEvent.change(box, { target: { value: 'solo' } }); expect(box.value).toBe('solo');
  });
});
