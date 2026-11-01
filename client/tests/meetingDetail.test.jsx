// Integration: renders the whole Meeting Detail page against mocked services (no real network, no real browser).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '../src/context/AuthContext';
import MeetingDetail from '../src/pages/MeetingDetail';
import { resetAIStatusCache } from '../src/hooks/useAIStatus';
import * as aiService from '../src/services/aiService';
import * as ai from '../src/services/meetingAiService';
import * as meetingService from '../src/services/meetingService';
import * as taskService from '../src/services/taskService';
import * as workspaceService from '../src/services/workspaceService';

vi.mock('../src/services/aiService', () => ({ languages: vi.fn(), status: vi.fn() }));
vi.mock('../src/services/meetingAiService', () => ({ getTranscript: vi.fn(), transcriptStatus: vi.fn(), startTranscription: vi.fn(), retryTranscription: vi.fn(), listTranslations: vi.fn(), getTranslation: vi.fn(), requestTranslation: vi.fn(), getSummary: vi.fn(), requestSummary: vi.fn() }));
vi.mock('../src/services/meetingService', () => ({ get: vi.fn() }));
vi.mock('../src/services/taskService', () => ({ list: vi.fn(), update: vi.fn() }));
vi.mock('../src/services/workspaceService', () => ({ list: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const LANGS = [{ code: 'en', name: 'English', native: 'English', transcription: true, translation: true }, { code: 'hi', name: 'Hindi', native: 'हिन्दी', transcription: true, translation: true }];
const MEETING = { id: 'm1', title: 'Dashboard sync', hostId: 'u1', workspaceId: 'w1', status: 'ended', roomCode: 'RC', startedAt: '2026-01-10T10:00:00Z', languageSettings: { primaryLanguage: 'hi', autoDetect: false } };
const SEGS = [{ idx: 0, start: 0, end: 2, text: 'नमस्ते टीम', language: 'hi' }, { idx: 1, start: 12, end: 20, text: 'हमें शुक्रवार तक डैशबोर्ड चाहिए', language: 'hi' }, { idx: 2, start: 30, end: 33, text: 'ठीक है', language: 'hi' }];
const TASK = { id: 't1', title: 'Finish dashboard', status: 'pending', needsReview: true, source: 'ai', assigneeId: null, ownerText: null, deadline: null, deadlineText: 'by Friday', sourceSegmentIdx: 1 };

function setup({ features = { transcription: true, language: true, search: true }, summary = { status: 'completed', summary: { language: 'en', overview: 'The team planned the dashboard launch.', decisions: [], discussionPoints: ['Timeline'], openQuestions: [], risks: [], actionItems: [{ taskId: 't1', title: 'Finish the dashboard' }] } }, url = '/meetings/m1' } = {}) {
  vi.resetModules?.();
  aiService.status.mockResolvedValue(features); aiService.languages.mockResolvedValue(LANGS);
  meetingService.get.mockResolvedValue(MEETING);
  workspaceService.list.mockResolvedValue([{ id: 'w1', name: 'Team', members: [{ userId: { _id: 'u1', name: 'Alice' }, role: 'owner' }] }]);
  taskService.list.mockResolvedValue([TASK]); taskService.update.mockImplementation(async (id, patch) => ({ ...TASK, ...patch }));
  ai.getTranscript.mockResolvedValue({ transcript: { status: 'completed', sourceLanguage: 'hi', languageDetected: false, segmentCount: 3, durationSec: 33, hasSpeakerLabels: false }, segments: SEGS, total: 3 });
  ai.getSummary.mockResolvedValue({ ...summary, language: summary.summary?.language || 'en' });
  ai.listTranslations.mockResolvedValue([]);
  return render(<AuthContext.Provider value={{ user: { id: 'u1', name: 'Alice' } }}><MemoryRouter initialEntries={[url]}><Routes><Route path="/meetings/:id" element={<MeetingDetail />} /></Routes></MemoryRouter></AuthContext.Provider>);
}
beforeEach(() => { cleanup(); vi.clearAllMocks(); resetAIStatusCache(); });

describe('MeetingDetail (integration, mocked services)', () => {
  it('shows summary, language, status, action items, and the original transcript together', async () => {
    setup();
    expect(await screen.findByText('The team planned the dashboard launch.')).toBeTruthy();
    expect((await screen.findAllByText('Hindi')).length).toBeGreaterThan(0); expect(screen.getByText('Set for this meeting')).toBeTruthy();
    expect(screen.getByText('3 segments · 0:33')).toBeTruthy(); expect(screen.getByText('Completed')).toBeTruthy();
    const actions = screen.getByRole('region', { name: 'Action items' });
    expect(await within(actions).findByText('Finish the dashboard')).toBeTruthy(); expect(within(actions).getByText('Needs review')).toBeTruthy(); expect(within(actions).getByText('Original: Finish dashboard')).toBeTruthy();
    expect(await screen.findByText('हमें शुक्रवार तक डैशबोर्ड चाहिए')).toBeTruthy();
  });

  it('deep link highlights the segment; "Jump to transcript" moves the highlight', async () => {
    const { container } = setup({ url: '/meetings/m1?segment=2' });
    await waitFor(() => expect(container.querySelector('#seg-2')?.className).toMatch(/segment-highlight/));
    fireEvent.click(await screen.findByRole('button', { name: 'Jump to transcript' }));
    await waitFor(() => expect(container.querySelector('#seg-1')?.className).toMatch(/segment-highlight/));
  });

  it('confirming an action item updates it optimistically and calls the API', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(taskService.update).toHaveBeenCalledWith('t1', { needsReview: false }));
    await waitFor(() => expect(screen.queryByText('Needs review')).toBeNull());
  });

  it('Translated view: requests once, shows the labeled translation with the original beneath', async () => {
    setup();
    await screen.findByText('हमें शुक्रवार तक डैशबोर्ड चाहिए');
    ai.requestTranslation.mockResolvedValue({ status: 'processing' });
    fireEvent.click(screen.getByRole('button', { name: 'Translated' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Translate' }));
    await waitFor(() => expect(ai.requestTranslation).toHaveBeenCalledWith('m1', 'en'));
    expect(await screen.findByText('Translating…')).toBeTruthy();
    ai.listTranslations.mockResolvedValue([{ targetLanguage: 'en', status: 'completed' }]);
    ai.getTranslation.mockResolvedValue({ segments: [{ idx: 0, text: 'Hello team' }, { idx: 1, text: 'We need the dashboard by Friday' }, { idx: 2, text: 'Okay' }] });
    expect(await screen.findByText('We need the dashboard by Friday', {}, { timeout: 6000 })).toBeTruthy();
    expect(screen.getAllByText('Translated').length).toBeGreaterThan(1); expect(screen.getByText('हमें शुक्रवार तक डैशबोर्ड चाहिए')).toBeTruthy();
  }, 15000);

  it('without API keys: Not configured for transcription and summary, no fake content', async () => {
    setup({ features: { transcription: false, language: false, search: false }, summary: { status: 'none', language: 'en' } });
    await screen.findByText('हमें शुक्रवार तक डैशबोर्ड चाहिए');
    expect(await screen.findByText('GROQ_API_KEY')).toBeTruthy(); expect(await screen.findAllByText('GEMINI_API_KEY')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Generate summary' })).toBeNull(); expect(screen.queryByRole('button', { name: /generate transcript|re-run transcription/i })).toBeNull();
  });

  it('a failed meeting load shows an error with Retry', async () => {
    setup(); meetingService.get.mockRejectedValueOnce({ response: { data: { message: 'You do not have access to this meeting.' } } });
    cleanup(); setup(); meetingService.get.mockReset(); meetingService.get.mockRejectedValueOnce({ response: { data: { message: 'You do not have access to this meeting.' } } }).mockResolvedValue(MEETING);
    cleanup();
    render(<AuthContext.Provider value={{ user: { id: 'u1' } }}><MemoryRouter initialEntries={['/meetings/m1']}><Routes><Route path="/meetings/:id" element={<MeetingDetail />} /></Routes></MemoryRouter></AuthContext.Provider>);
    expect((await screen.findByRole('alert')).textContent).toMatch(/do not have access/i);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' })); expect(await screen.findByText('Dashboard sync')).toBeTruthy();
  });
});
