import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, renderHook, act, within } from '@testing-library/react';
import { SocketContext } from '../src/context/SocketContext';
import ReactionButton from '../src/components/meeting/ReactionButton';
import ReactionLayer from '../src/components/meeting/ReactionLayer';
import { useReactions } from '../src/hooks/useReactions';
import { REACTIONS, MAX_FLOATING, addFloating, isKnownEmoji, labelFor, laneFor, wobbleFor, durationFor } from '../src/lib/reactions';

beforeEach(() => cleanup());

describe('reaction helpers', () => {
  it('offers exactly the eight emojis the server accepts', () => {
    expect(REACTIONS.map((r) => r.emoji)).toEqual(['👍', '👏', '❤️', '😂', '😮', '🎉', '🙏', '🔥']);   // same literal as server/tests/reactions.test.js
    expect(REACTIONS.every((r) => r.label)).toBe(true);
    expect(isKnownEmoji('🎉')).toBe(true); expect(isKnownEmoji('💩')).toBe(false); expect(isKnownEmoji('<b>')).toBe(false); expect(labelFor('🔥')).toBe('Fire'); expect(labelFor('x')).toBe('a reaction');
  });
  it('keeps floating emojis inside the video area, with bounded drift and duration', () => {
    expect([0, 0.5, 0.999999, 1].map((r) => laneFor(() => r))).toEqual([8, 50, 92, 92]);
    expect(wobbleFor(() => 0)).toBe(-40); expect(wobbleFor(() => 1)).toBe(40);
    expect(durationFor(() => 0)).toBe(2.8); expect(durationFor(() => 1)).toBe(4);
  });
  it('ignores duplicates and never keeps more than the cap, dropping the oldest', () => {
    let list = []; for (let i = 0; i < MAX_FLOATING + 6; i += 1) list = addFloating(list, { id: `r${i}` });
    expect(list).toHaveLength(MAX_FLOATING); expect(list[0].id).toBe('r6'); expect(list.at(-1).id).toBe(`r${MAX_FLOATING + 5}`);
    expect(addFloating(list, { id: 'r10' })).toBe(list);
  });
});

describe('ReactionButton (picker)', () => {
  it('opens a labeled group of eight emoji buttons; clicking sends that emoji and keeps the picker open', () => {
    const onReact = vi.fn(); render(<ReactionButton onReact={onReact} />);
    const trigger = screen.getByRole('button', { name: 'Reactions' }); expect(trigger.getAttribute('aria-expanded')).toBe('false'); expect(screen.queryByRole('group', { name: /send a reaction/i })).toBeNull();
    fireEvent.click(trigger);
    const group = screen.getByRole('group', { name: /send a reaction/i }); expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(within(group).getAllByRole('button')).toHaveLength(8);
    fireEvent.click(within(group).getByRole('button', { name: 'Send Celebration reaction' })); fireEvent.click(within(group).getByRole('button', { name: 'Send Heart reaction' }));
    expect(onReact.mock.calls.map((c) => c[0])).toEqual(['🎉', '❤️']); expect(screen.getByRole('group', { name: /send a reaction/i })).toBeTruthy();
  });
  it('moves focus into the picker when it opens; Escape closes it, returns focus to the button, and marks the event handled', () => {
    render(<ReactionButton onReact={() => {}} />);
    const trigger = screen.getByRole('button', { name: 'Reactions' }); fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Send Thumbs up reaction' }));
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }); act(() => { document.dispatchEvent(ev); });
    expect(screen.queryByRole('group', { name: /send a reaction/i })).toBeNull(); expect(document.activeElement).toBe(trigger); expect(ev.defaultPrevented).toBe(true);   // so the side panel won't also close
  });
  it('a click outside closes it, a click inside does not', () => {
    render(<div><ReactionButton onReact={() => {}} /><button>elsewhere</button></div>);
    fireEvent.click(screen.getByRole('button', { name: 'Reactions' }));
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Send Fire reaction' })); expect(screen.getByRole('group', { name: /send a reaction/i })).toBeTruthy();
    fireEvent.mouseDown(screen.getByText('elsewhere')); expect(screen.queryByRole('group', { name: /send a reaction/i })).toBeNull();
  });
  it('is disabled (and closed) until the call is connected', () => {
    const { rerender } = render(<ReactionButton onReact={() => {}} disabled />);
    expect(screen.getByRole('button', { name: 'Reactions' }).disabled).toBe(true);
    rerender(<ReactionButton onReact={() => {}} />); fireEvent.click(screen.getByRole('button', { name: 'Reactions' })); expect(screen.getByRole('group', { name: /send a reaction/i })).toBeTruthy();
    rerender(<ReactionButton onReact={() => {}} disabled />); expect(screen.queryByRole('group', { name: /send a reaction/i })).toBeNull();
  });
});

describe('useReactions', () => {
  const fakeSocket = () => { const h = {}; return { emit: vi.fn(), on: (e, f) => { (h[e] ||= []).push(f); }, off: (e, f) => { h[e] = (h[e] || []).filter((x) => x !== f); }, fire: (e, p) => act(() => { (h[e] || []).forEach((f) => f(p)); }), count: (e) => (h[e] || []).length }; };
  const setup = (socket, opts = {}) => renderHook(() => useReactions(opts), { wrapper: ({ children }) => <SocketContext.Provider value={{ getSocket: () => socket }}>{children}</SocketContext.Provider> });

  it('shows reactions from the server (yours included) with the sender name, a lane and a duration', async () => {
    const s = fakeSocket(); const { result } = setup(s, { rnd: () => 0.5 });
    await s.fire('reaction:received', { id: 'a', emoji: '🎉', name: 'Ana' }); await s.fire('reaction:received', { id: 'b', emoji: '👍', name: 'Raj' });
    expect(result.current.floating.map((f) => [f.emoji, f.name, f.lane])).toEqual([['🎉', 'Ana', 50], ['👍', 'Raj', 50]]);
    expect(result.current.latest).toEqual({ id: 'b', emoji: '👍', name: 'Raj' });
  });
  it('ignores unknown emoji, malformed events and duplicate ids (never renders anything it does not recognize)', async () => {
    const s = fakeSocket(); const { result } = setup(s);
    for (const bad of [{ id: 'x', emoji: '💩', name: 'N' }, { emoji: '🎉' }, { id: 'y', emoji: '<img src=x onerror=alert(1)>' }, null, undefined]) await s.fire('reaction:received', bad);
    expect(result.current.floating).toEqual([]);
    await s.fire('reaction:received', { id: 'd', emoji: '🔥', name: 'N' }); await s.fire('reaction:received', { id: 'd', emoji: '🔥', name: 'N' });
    expect(result.current.floating).toHaveLength(1);
  });
  it('remove() drops one by id; unmounting stops listening', async () => {
    const s = fakeSocket(); const { result, unmount } = setup(s);
    await s.fire('reaction:received', { id: 'a', emoji: '🎉', name: 'A' }); await s.fire('reaction:received', { id: 'b', emoji: '🙏', name: 'B' });
    act(() => result.current.remove('a')); expect(result.current.floating.map((f) => f.id)).toEqual(['b']);
    expect(s.count('reaction:received')).toBe(1); unmount(); expect(s.count('reaction:received')).toBe(0);
  });
  it('send() emits only known emoji and throttles rapid taps', () => {
    const s = fakeSocket(); let t = 1000; const { result } = setup(s, { now: () => t });
    expect(result.current.send('💩')).toBe(false); expect(s.emit).not.toHaveBeenCalled();
    expect(result.current.send('🎉')).toBe(true); expect(s.emit).toHaveBeenCalledWith('reaction:send', { emoji: '🎉' }, expect.any(Function));
    t += 100; expect(result.current.send('🎉')).toBe(false);       // too soon
    t += 450; expect(result.current.send('👏')).toBe(true); expect(s.emit).toHaveBeenCalledTimes(2);
  });
  it('does nothing while disabled (before the call is joined)', async () => {
    const s = fakeSocket(); const { result } = setup(s, { enabled: false });
    expect(s.count('reaction:received')).toBe(0); expect(result.current.floating).toEqual([]);
  });
});

describe('ReactionLayer', () => {
  it('is decorative: hidden from assistive tech, ignores the mouse, shows each emoji with its sender', () => {
    render(<ReactionLayer items={[{ id: '1', emoji: '🎉', name: 'Ana', lane: 20, wobble: 5, dur: 3 }, { id: '2', emoji: '🔥', name: 'Raj', lane: 70, wobble: -5, dur: 3 }]} onDone={() => {}} />);
    const layer = screen.getByTestId('reaction-layer');
    expect(layer.getAttribute('aria-hidden')).toBe('true'); expect(layer.className).toMatch(/pointer-events-none/); expect(layer.className).toMatch(/inset-0/);
    expect(within(layer).getByText('🎉')).toBeTruthy(); expect(within(layer).getByText('Ana')).toBeTruthy(); expect(within(layer).getByText('Raj')).toBeTruthy();
  });
  it('renders sender names as plain text (no markup)', () => {
    const { container } = render(<ReactionLayer items={[{ id: '1', emoji: '👍', name: '<img src=x onerror=alert(1)>', lane: 10, wobble: 0, dur: 3 }]} onDone={() => {}} />);
    expect(container.querySelector('img')).toBeNull(); expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });
  it('renders nothing visible when there are no reactions', () => { render(<ReactionLayer items={[]} onDone={() => {}} />); expect(screen.getByTestId('reaction-layer').children).toHaveLength(0); });
});
