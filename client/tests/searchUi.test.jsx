import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup, renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../src/context/AuthContext';
import SearchBar from '../src/components/search/SearchBar';
import AnswerCard from '../src/components/search/AnswerCard';
import SourceCard from '../src/components/search/SourceCard';
import InsufficientEvidence from '../src/components/search/InsufficientEvidence';
import MeetingSearch from '../src/pages/MeetingSearch';
import { useMeetingSearch } from '../src/hooks/useMeetingSearch';
import * as searchService from '../src/services/searchService';
import * as aiService from '../src/services/aiService';
import * as workspaceService from '../src/services/workspaceService';
import * as meetingService from '../src/services/meetingService';

vi.mock('../src/services/searchService', () => ({ query: vi.fn(), suggestions: vi.fn() }));
vi.mock('../src/services/aiService', () => ({ languages: vi.fn(), status: vi.fn() }));
vi.mock('../src/services/workspaceService', () => ({ list: vi.fn() }));
vi.mock('../src/services/meetingService', () => ({ list: vi.fn() }));

const NONE = "I couldn't find enough information in your accessible meeting records to answer that question.";
const src = (n, extra = {}) => ({ n, sourceId: `S${n}`, meetingId: 'm1', meetingTitle: 'Dashboard planning', date: '2026-01-10', idx: 3, start: 75, end: 80, text: 'We decided to launch on March 15.', openUrl: '/meetings/m1?segment=3', ...extra });
beforeEach(() => {
  cleanup(); vi.clearAllMocks();
  aiService.languages.mockResolvedValue([{ code: 'en', name: 'English' }, { code: 'hi', name: 'Hindi' }]);
  workspaceService.list.mockResolvedValue([{ id: 'w1', name: 'Team' }]);
  meetingService.list.mockResolvedValue({ meetings: [{ id: 'm1', title: 'Dashboard planning', startedAt: '2026-01-10T10:00:00Z' }] });
  searchService.suggestions.mockResolvedValue([{ language: 'en', questions: ['What decisions did we make about the dashboard?'] }, { language: 'hi', questions: ['बजट के बारे में क्या चर्चा हुई?'] }]);
});

describe('SearchBar', () => {
  it('Enter submits, Shift+Enter does not, empty text never submits', () => {
    const onSubmit = vi.fn(); const { rerender } = render(<SearchBar value="what?" onChange={() => {}} onSubmit={onSubmit} />);
    const box = screen.getByLabelText(/ask anything/i);
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true }); expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter' }); expect(onSubmit).toHaveBeenCalledOnce();
    rerender(<SearchBar value="   " onChange={() => {}} onSubmit={onSubmit} />);
    fireEvent.keyDown(screen.getByLabelText(/ask anything/i), { key: 'Enter' }); expect(onSubmit).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /search/i }).disabled).toBe(true);
  });
});

describe('AnswerCard + SourceCard', () => {
  it('turns [n] into buttons that focus the matching source; shows conflicts and limitations; renders text safely', () => {
    render(<MemoryRouter><AnswerCard answer={'We launch on March 15 [1]. <b>x</b> [2]'} conflicts={['A says X; B says Y']} limitations={['Only 1 of 2 meetings indexed.']} sourceCount={2} /><SourceCard source={src(1)} langName={(c) => c} /><SourceCard source={src(2)} langName={(c) => c} /></MemoryRouter>);
    const target = document.getElementById('source-2'); const focus = vi.spyOn(target, 'focus');
    fireEvent.click(screen.getByRole('button', { name: /go to source 2 of 2/i })); expect(focus).toHaveBeenCalled();
    expect(screen.getByText(/sources disagree/i)).toBeTruthy(); expect(screen.getByText('A says X; B says Y')).toBeTruthy(); expect(screen.getByText(/only 1 of 2 meetings/i)).toBeTruthy();
    expect(document.querySelector('section[aria-label="Answer"] b')).toBeNull();
  });
  it('source shows the ORIGINAL excerpt, separates a labeled translation, and links to the exact moment', () => {
    render(<MemoryRouter><SourceCard source={src(1, { translatedText: 'हम 15 मार्च को लॉन्च करेंगे।', translatedLanguage: 'hi' })} langName={(c) => (c === 'hi' ? 'Hindi' : c)} /></MemoryRouter>);
    expect(screen.getByText('We decided to launch on March 15.')).toBeTruthy(); expect(screen.queryByText(/Translated to Hindi/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /show full excerpt/i }));
    expect(screen.getByText('Translated to Hindi')).toBeTruthy(); expect(screen.getByText('हम 15 मार्च को लॉन्च करेंगे।')).toBeTruthy();
    expect(screen.getByRole('link', { name: /open in meeting/i }).getAttribute('href')).toBe('/meetings/m1?segment=3');
    expect(screen.getByText('1:15')).toBeTruthy();
  });
  it('insufficient evidence shows the exact server message plus a hint', () => {
    render(<InsufficientEvidence message={NONE} />);
    expect(screen.getByText(NONE)).toBeTruthy(); expect(screen.getByText(/widening the date range/i)).toBeTruthy();
  });
});

describe('MeetingSearch page states', () => {
  const user = { id: 'u1', name: 'Alice', languagePreferences: {} };
  const renderPage = (url = '/search') => render(<AuthContext.Provider value={{ user }}><MemoryRouter initialEntries={[url]}><MeetingSearch /></MemoryRouter></AuthContext.Provider>);
  const ask = async (text) => { const box = await screen.findByLabelText(/ask anything/i); fireEvent.change(box, { target: { value: text } }); fireEvent.keyDown(box, { key: 'Enter' }); };

  it('idle shows example chips; picking one runs the search', async () => {
    searchService.query.mockResolvedValue({ mode: 'insufficient', message: NONE, sources: [] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /what decisions did we make/i }));
    await waitFor(() => expect(searchService.query).toHaveBeenCalledWith(expect.objectContaining({ question: 'What decisions did we make about the dashboard?', answerLanguage: 'en' })));
    expect((await screen.findByText(NONE))).toBeTruthy();
  });
  it('answer mode: answer + sources count + filters sent as a validated body', async () => {
    searchService.query.mockResolvedValue({ mode: 'answer', answer: 'Launch is March 15 [1].', conflicts: [], limitations: [], sources: [src(1)] });
    renderPage();
    fireEvent.change(await screen.findByLabelText('Meeting'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByLabelText('Answer in'), { target: { value: 'hi' } });
    await ask('When do we launch?');
    expect(await screen.findByRole('region', { name: 'Answer' })).toBeTruthy();
    expect(searchService.query).toHaveBeenCalledWith({ question: 'When do we launch?', meetingIds: ['m1'], answerLanguage: 'hi' });
    expect(screen.getByRole('complementary', { name: 'Sources (1)' })).toBeTruthy(); expect(screen.getByRole('button', { name: /go to source 1/i })).toBeTruthy();
  });
  it('keyword-only without a key shows Not configured plus the excerpts', async () => {
    searchService.query.mockResolvedValue({ mode: 'keyword_only', notConfigured: true, banner: 'x', answer: null, sources: [src(1)] });
    renderPage(); await ask('dashboard');
    expect(await screen.findByText('GEMINI_API_KEY')).toBeTruthy(); expect(screen.getAllByRole('status').some((s) => /Not configured/.test(s.textContent))).toBe(true);
    expect(screen.getByText(/matching excerpts/i)).toBeTruthy(); expect(screen.getByText('We decided to launch on March 15.')).toBeTruthy();
  });
  it('keyword-only after a provider error shows the server banner', async () => {
    searchService.query.mockResolvedValue({ mode: 'keyword_only', notConfigured: false, banner: 'The AI answer is unavailable right now. Showing matching excerpts instead.', answer: null, sources: [src(1)] });
    renderPage(); await ask('dashboard');
    expect(await screen.findByText(/AI answer is unavailable/i)).toBeTruthy();
  });
  it('request failure shows an alert and Retry re-runs the same question', async () => {
    searchService.query.mockRejectedValueOnce({ response: { data: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' } } }).mockResolvedValueOnce({ mode: 'insufficient', message: NONE, sources: [] });
    renderPage(); await ask('anything');
    expect((await screen.findByRole('alert')).textContent).toMatch(/too many requests/i);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' })); expect(await screen.findByText(NONE)).toBeTruthy();
    expect(searchService.query).toHaveBeenCalledTimes(2);
  });
  it('?q= from the dashboard runs immediately', async () => {
    searchService.query.mockResolvedValue({ mode: 'insufficient', message: NONE, sources: [] });
    renderPage('/search?q=budget%20plan');
    await waitFor(() => expect(searchService.query).toHaveBeenCalledWith(expect.objectContaining({ question: 'budget plan' })));
  });
});

describe('useMeetingSearch', () => {
  it('ignores a late response from an older request', async () => {
    let resolveSlow; searchService.query.mockImplementationOnce(() => new Promise((r) => { resolveSlow = r; })).mockResolvedValueOnce({ mode: 'answer', answer: 'fresh' });
    const { result } = renderHook(() => useMeetingSearch());
    act(() => { result.current.run({ question: 'slow' }); });
    await act(async () => { await result.current.run({ question: 'fast' }); });
    expect(result.current.result.answer).toBe('fresh');
    await act(async () => { resolveSlow({ mode: 'answer', answer: 'STALE' }); });
    expect(result.current.result.answer).toBe('fresh');
  });
});
