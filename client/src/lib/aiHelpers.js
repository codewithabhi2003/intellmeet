// Pure helpers (unit tested).
export const fmtTime = (sec) => {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(r).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

// Splits "We decided X [1][2]." into text and citation parts so markers can become links to the source cards.
export const splitAnswer = (text) => String(text || '').split(/(\[\d+\])/g).filter(Boolean)
  .map((part) => { const m = part.match(/^\[(\d+)\]$/); return m ? { type: 'cite', n: Number(m[1]) } : { type: 'text', value: part }; });

export const dayStartISO = (d) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);
export const dayEndISO = (d) => (d ? new Date(`${d}T23:59:59.999`).toISOString() : undefined);

export const buildSearchBody = ({ question, from, to, workspaceId, meetingId, answerLanguage }) => {
  const body = { question: question.trim() };
  const dateRange = { ...(from && { from: dayStartISO(from) }), ...(to && { to: dayEndISO(to) }) };
  if (Object.keys(dateRange).length) body.dateRange = dateRange;
  if (workspaceId) body.workspaceId = workspaceId;
  if (meetingId) body.meetingIds = [meetingId];
  if (answerLanguage) body.answerLanguage = answerLanguage;
  return body;
};

// Client-side filter for the in-transcript search box (case-insensitive; Hindi works because it is plain substring matching).
export const filterSegments = (segments, query, textOf = (s) => s.text) => {
  const q = query.trim().toLowerCase();
  return q ? segments.filter((s) => textOf(s).toLowerCase().includes(q)) : segments;
};

export const indexOfSegment = (segments, idx) => segments.findIndex((s) => s.idx === Number(idx));

export const STATUS_COLUMNS = [['pending', 'To do'], ['in_progress', 'In progress'], ['done', 'Done']];
export const groupTasks = (tasks) => Object.fromEntries(STATUS_COLUMNS.map(([k]) => [k, tasks.filter((t) => t.status === k)]));
export const formatDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '');
