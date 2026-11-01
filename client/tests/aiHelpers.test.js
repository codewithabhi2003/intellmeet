import { describe, it, expect } from 'vitest';
import { fmtTime, splitAnswer, buildSearchBody, filterSegments, indexOfSegment, groupTasks, dayEndISO } from '../src/lib/aiHelpers';

describe('ai helpers', () => {
  it('formats timestamps', () => { expect([0, 5, 65, 3599, 3600, 3725].map(fmtTime)).toEqual(['0:00', '0:05', '1:05', '59:59', '1:00:00', '1:02:05']); expect(fmtTime(-3)).toBe('0:00'); expect(fmtTime(undefined)).toBe('0:00'); });
  it('splits answers into text and citation parts', () => {
    expect(splitAnswer('We decided X [1][2]. Also Y [3]')).toEqual([{ type: 'text', value: 'We decided X ' }, { type: 'cite', n: 1 }, { type: 'cite', n: 2 }, { type: 'text', value: '. Also Y ' }, { type: 'cite', n: 3 }]);
    expect(splitAnswer('no markers [S1] here')).toEqual([{ type: 'text', value: 'no markers [S1] here' }]);   // raw ids are never turned into links
    expect(splitAnswer('')).toEqual([]);
  });
  it('builds the search body: trimmed question, optional filters only, end-of-day upper bound', () => {
    expect(buildSearchBody({ question: ' hi ', from: '', to: '', workspaceId: '', meetingId: '', answerLanguage: 'hi' })).toEqual({ question: 'hi', answerLanguage: 'hi' });
    const b = buildSearchBody({ question: 'q', from: '2026-01-02', to: '2026-01-03', workspaceId: 'w', meetingId: 'm', answerLanguage: 'en' });
    expect(b).toMatchObject({ workspaceId: 'w', meetingIds: ['m'], answerLanguage: 'en' });
    expect(b.dateRange.from).toBe(new Date('2026-01-02T00:00:00').toISOString()); expect(b.dateRange.to).toBe(dayEndISO('2026-01-03'));
    expect(new Date(b.dateRange.to) > new Date('2026-01-03T23:59:00')).toBe(true);
  });
  it('filters transcript segments case-insensitively, including Hindi', () => {
    const segs = [{ idx: 0, text: 'Launch the Dashboard' }, { idx: 1, text: 'नमस्ते टीम' }, { idx: 2, text: 'Budget' }];
    expect(filterSegments(segs, 'dashboard').map((s) => s.idx)).toEqual([0]);
    expect(filterSegments(segs, 'टीम').map((s) => s.idx)).toEqual([1]);
    expect(filterSegments(segs, '  ')).toHaveLength(3);
    expect(filterSegments(segs, 'x', (s) => `${s.text} x`)).toHaveLength(3);
  });
  it('finds a segment by idx (string or number) and groups tasks by status', () => {
    expect(indexOfSegment([{ idx: 4 }, { idx: 9 }], '9')).toBe(1); expect(indexOfSegment([{ idx: 4 }], 7)).toBe(-1);
    const g = groupTasks([{ status: 'pending' }, { status: 'done' }, { status: 'pending' }]);
    expect([g.pending.length, g.in_progress.length, g.done.length]).toEqual([2, 0, 1]);
  });
});
