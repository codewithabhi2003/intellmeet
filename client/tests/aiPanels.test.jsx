import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../src/context/AuthContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import TranscriptViewer from '../src/components/transcript/TranscriptViewer';
import TranscriptionControls from '../src/components/transcript/TranscriptionControls';
import ProcessingState from '../src/components/transcript/ProcessingState';
import TranslationToggle from '../src/components/language/TranslationToggle';
import SummaryPanel from '../src/components/summary/SummaryPanel';
import ActionItemList from '../src/components/summary/ActionItemList';
import TaskBoard from '../src/components/tasks/TaskBoard';
import Settings from '../src/pages/Settings';
import * as aiService from '../src/services/aiService';
import * as userService from '../src/services/userService';

vi.mock('../src/services/aiService', () => ({ languages: vi.fn(), status: vi.fn() }));
vi.mock('../src/services/userService', () => ({ updateMe: vi.fn(), putLanguagePreferences: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
beforeEach(() => { cleanup(); vi.clearAllMocks(); });

const SEGS = [{ idx: 0, start: 0, text: 'नमस्ते टीम' }, { idx: 1, start: 12, text: '<img src=x onerror="alert(1)"> We need the dashboard by Friday' }, { idx: 2, start: 3725, text: 'Budget is flat' }];

describe('TranscriptViewer', () => {
  it('renders original text as plain text with timestamps (no markup injection)', () => {
    const { container } = render(<TranscriptViewer segments={SEGS} hasSpeakerLabels={false} />);
    expect(screen.getByText('नमस्ते टीम')).toBeTruthy(); expect(screen.getByText('1:02:05')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull(); expect(screen.getByText(/We need the dashboard by Friday/)).toBeTruthy();
    expect(screen.queryByText('Automatic label')).toBeNull();
  });
  it('translated mode labels the translation and keeps the original visible beneath it', () => {
    render(<TranscriptViewer segments={SEGS} translations={new Map([[0, 'Hello team'], [2, 'बजट स्थिर है']])} />);
    expect(screen.getByText('Hello team')).toBeTruthy(); expect(screen.getAllByText('Translated').length).toBe(2);
    expect(screen.getByText('नमस्ते टीम')).toBeTruthy();                         // original never hidden
    expect(screen.getAllByText(/Original:/).length).toBe(2);
  });
  it('in-transcript search filters rows and shows a friendly empty result', () => {
    const { rerender } = render(<TranscriptViewer segments={SEGS} query="budget" />);
    expect(screen.getByText('Budget is flat')).toBeTruthy(); expect(screen.queryByText('नमस्ते टीम')).toBeNull();
    rerender(<TranscriptViewer segments={SEGS} query="zzz" />); expect(screen.getByRole('status').textContent).toMatch(/no segments match/i);
  });
  it('deep link (?segment=idx) pulses a highlight on that segment only', async () => {
    const { container } = render(<TranscriptViewer segments={SEGS} focusIdx="1" />);
    await waitFor(() => expect(container.querySelector('#seg-1').className).toMatch(/segment-highlight/));
    expect(container.querySelector('#seg-0').className).not.toMatch(/segment-highlight/);
  });
  it('only shows a speaker label when real labels exist, with the Automatic label tooltip', () => {
    render(<TranscriptViewer segments={[{ idx: 0, start: 0, text: 'hi', speakerLabel: 'Speaker 1' }]} hasSpeakerLabels />);
    expect(screen.getByTitle('Automatic label').textContent).toBe('Speaker 1');
  });
});

describe('transcription + translation controls', () => {
  const langs = [{ code: 'en', name: 'English', native: 'English' }, { code: 'hi', name: 'Hindi', native: 'हिन्दी' }];
  it('without GROQ_API_KEY it shows Not configured, never a start button', () => {
    render(<TranscriptionControls status="none" configured={false} canManage languages={langs} />);
    expect(screen.getByRole('status').textContent).toMatch(/GROQ_API_KEY/); expect(screen.queryByRole('button')).toBeNull();
  });
  it('non-managers see nothing; managers get a state-appropriate action and can choose the language', () => {
    const { container, rerender } = render(<TranscriptionControls status="none" configured canManage={false} languages={langs} />);
    expect(container.textContent).toBe('');
    const onStart = vi.fn(), onRetry = vi.fn();
    rerender(<TranscriptionControls status="none" configured canManage languages={langs} onStart={onStart} onRetry={onRetry} />);
    fireEvent.change(screen.getByLabelText('Spoken language'), { target: { value: 'hi' } }); fireEvent.click(screen.getByRole('button', { name: 'Generate transcript' }));
    expect(onStart).toHaveBeenCalledWith({ language: 'hi' });
    rerender(<TranscriptionControls status="failed" configured canManage languages={langs} onStart={onStart} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry transcription' })); expect(onRetry).toHaveBeenCalledWith({ language: 'hi' });   // the chosen language is kept
    rerender(<TranscriptionControls status="processing" configured canManage languages={langs} />); expect(screen.queryByRole('button')).toBeNull();
    rerender(<TranscriptionControls status="completed" configured canManage languages={langs} />); expect(screen.getByText(/removes its translations and summaries/i)).toBeTruthy();
  });
  it('processing state explains failures in plain language', () => {
    const { rerender } = render(<ProcessingState status="processing" />); expect(screen.getByText('Processing')).toBeTruthy();
    rerender(<ProcessingState status="failed" failureCode="NO_RECORDING" />); expect(screen.getByRole('alert').textContent).toMatch(/no recording was uploaded/i);
    rerender(<ProcessingState status="failed" failureCode="WHATEVER" />); expect(screen.getByRole('alert').textContent).toMatch(/processing failed/i);
  });
  it('translation toggle: original/translated, translate button only when needed, key requirement explained', () => {
    const onMode = vi.fn(), onRequest = vi.fn();
    const base = { mode: 'original', onMode, languages: [langs[1]], target: 'hi', onTarget: () => {}, status: 'none', onRequest, configured: true };
    const { rerender } = render(<TranslationToggle {...base} />);
    expect(screen.getByRole('button', { name: 'Original' }).getAttribute('aria-pressed')).toBe('true'); expect(screen.queryByRole('button', { name: 'Translate' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Translated' })); expect(onMode).toHaveBeenCalledWith('translated');
    rerender(<TranslationToggle {...base} mode="translated" />); fireEvent.click(screen.getByRole('button', { name: 'Translate' })); expect(onRequest).toHaveBeenCalled();
    rerender(<TranslationToggle {...base} mode="translated" status="processing" />); expect(screen.getByText('Translating…')).toBeTruthy();
    rerender(<TranslationToggle {...base} mode="translated" configured={false} />); expect(screen.getByText(/GEMINI_API_KEY/)).toBeTruthy();
  });
});

describe('summary + action items', () => {
  const props = { loading: false, language: 'en', languages: [{ code: 'en', name: 'English', native: 'English' }], onLanguage: () => {}, onGenerate: vi.fn(), busy: false };
  it('state machine: needs transcript -> generate -> processing -> failed/retry; not configured', () => {
    const { rerender } = render(<SummaryPanel {...props} status="none" configured transcriptReady={false} />);
    expect(screen.getByText(/once the transcript is ready/i)).toBeTruthy();
    rerender(<SummaryPanel {...props} status="none" configured transcriptReady />); fireEvent.click(screen.getByRole('button', { name: 'Generate summary' })); expect(props.onGenerate).toHaveBeenCalledWith(false);
    rerender(<SummaryPanel {...props} status="processing" configured transcriptReady />); expect(screen.getByText('Writing the summary…')).toBeTruthy();
    rerender(<SummaryPanel {...props} status="failed" failureCode="RATE_LIMITED" configured transcriptReady />); expect(screen.getByRole('alert').textContent).toMatch(/rate limiting/i);
    rerender(<SummaryPanel {...props} status="none" configured={false} transcriptReady />); expect(screen.getByRole('status').textContent).toMatch(/GEMINI_API_KEY/);
  });
  it('completed summary lists sections and says "None stated." instead of inventing content', () => {
    render(<SummaryPanel {...props} status="completed" configured transcriptReady summary={{ overview: 'We planned the launch.', decisions: [], discussionPoints: ['Timeline'], openQuestions: [], risks: [] }} />);
    expect(screen.getByText('We planned the launch.')).toBeTruthy(); expect(screen.getByText('Timeline')).toBeTruthy(); expect(screen.getAllByText('None stated.')).toHaveLength(3);
  });
  const task = { id: 't1', title: 'Finish dashboard', status: 'pending', needsReview: true, source: 'ai', assigneeId: null, ownerText: null, deadline: null, deadlineText: 'by Friday', sourceSegmentIdx: 1 };
  it('AI action items: needs review, unknowns stay empty, owner/deadline shown as stated, confirm + status + jump work', () => {
    const onUpdate = vi.fn(), onJump = vi.fn();
    render(<ActionItemList tasks={[task, { ...task, id: 't2', needsReview: false, ownerText: 'Priya', title: 'Ship it', deadlineText: null }]} titles={new Map()} memberName={() => 'x'} onUpdate={onUpdate} onJump={onJump} />);
    expect(screen.getAllByText('Needs review')).toHaveLength(1); expect(screen.getByText(/No owner stated/)).toBeTruthy(); expect(screen.getByText(/Deadline as stated: by Friday/)).toBeTruthy();
    expect(screen.getByText(/Owner as stated: Priya \(not assigned\)/)).toBeTruthy(); expect(screen.getByText(/No deadline stated/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); expect(onUpdate).toHaveBeenCalledWith('t1', { needsReview: false });
    fireEvent.change(screen.getAllByLabelText('Status')[0], { target: { value: 'done' } }); expect(onUpdate).toHaveBeenCalledWith('t1', { status: 'done' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Jump to transcript' })[0]); expect(onJump).toHaveBeenCalledWith(1);
  });
  it('shows the summary-language title with the canonical one beneath, and edits the canonical title', async () => {
    const onUpdate = vi.fn().mockResolvedValue();
    render(<ActionItemList tasks={[task]} titles={new Map([['t1', 'डैशबोर्ड पूरा करें']])} memberName={() => 'x'} onUpdate={onUpdate} onJump={() => {}} />);
    expect(screen.getByText('डैशबोर्ड पूरा करें')).toBeTruthy(); expect(screen.getByText('Original: Finish dashboard')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /edit finish dashboard/i }));
    const input = screen.getByLabelText('Action item title'); expect(input.value).toBe('Finish dashboard');
    fireEvent.change(input, { target: { value: 'Finish the dashboard' } }); fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('t1', { title: 'Finish the dashboard' }));
  });
});

describe('TaskBoard + Settings', () => {
  it('groups tasks into status columns with counts and per-card controls', () => {
    const t = (id, status, extra = {}) => ({ id, title: `T-${id}`, status, workspaceId: 'w1', assigneeId: null, ...extra });
    const onUpdate = vi.fn();
    render(<MemoryRouter><TaskBoard tasks={[t('a', 'pending', { needsReview: true, source: 'ai' }), t('b', 'pending'), t('c', 'done')]} membersFor={() => [{ id: 'u1', name: 'Ana' }]} onUpdate={onUpdate} onDelete={() => {}} /></MemoryRouter>);
    expect(screen.getByRole('region', { name: /to do/i }).textContent).toMatch(/2/); expect(screen.getByRole('region', { name: /in progress/i }).textContent).toMatch(/Nothing here/);
    fireEvent.change(screen.getAllByLabelText('Assignee')[0], { target: { value: 'u1' } }); expect(onUpdate).toHaveBeenCalledWith('a', { assigneeId: 'u1' });
    fireEvent.change(screen.getAllByLabelText('Status')[0], { target: { value: 'in_progress' } }); expect(onUpdate).toHaveBeenCalledWith('a', { status: 'in_progress' });
    expect(screen.getByText('Needs review')).toBeTruthy(); expect(screen.getByText('AI')).toBeTruthy();
  });

  const user = { id: 'u1', name: 'Alice', email: 'a@x.dev', languagePreferences: { summaryLanguage: 'hi' } };
  const renderSettings = (setUser = vi.fn()) => { aiService.languages.mockResolvedValue([{ code: 'en', name: 'English', native: 'English', transcription: true }, { code: 'hi', name: 'Hindi', native: 'हिन्दी', transcription: true }]); render(<ThemeProvider><AuthContext.Provider value={{ user, setUser, logout: vi.fn() }}><MemoryRouter><Settings /></MemoryRouter></AuthContext.Provider></ThemeProvider>); return setUser; };
  it('language tab explains the precedence and saves empty selections as null', async () => {
    const setUser = renderSettings(); userService.putLanguagePreferences.mockResolvedValue({ transcriptLanguage: null, summaryLanguage: 'hi', searchAnswerLanguage: 'en' });
    fireEvent.click(screen.getByRole('tab', { name: 'Language' }));
    expect(await screen.findByText(/How a language is chosen/)).toBeTruthy();
    expect(screen.getByLabelText('Summary language').value).toBe('hi');
    fireEvent.change(screen.getByLabelText('Search answer language'), { target: { value: 'en' } }); fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    await waitFor(() => expect(userService.putLanguagePreferences).toHaveBeenCalledWith({ transcriptLanguage: null, summaryLanguage: 'hi', searchAnswerLanguage: 'en' }));
    await waitFor(() => expect(setUser).toHaveBeenCalledWith(expect.objectContaining({ languagePreferences: expect.objectContaining({ searchAnswerLanguage: 'en' }) })));
  });
  it('tabs follow the ARIA pattern (arrow keys move and select)', () => {
    renderSettings();
    const profile = screen.getByRole('tab', { name: 'Profile' }); expect(profile.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(profile.parentElement, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Appearance' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Appearance' }).parentElement, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Language' }).getAttribute('aria-selected')).toBe('true'); expect(screen.getByRole('tabpanel')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Language' }).parentElement, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Profile' }).getAttribute('aria-selected')).toBe('true');   // wraps around
  });
});
