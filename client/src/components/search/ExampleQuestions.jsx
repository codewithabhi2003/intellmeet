// Input suggestions only (from GET /api/meeting-search/suggestions). They are never shown as answers.
export default function ExampleQuestions({ questions, onPick }) {
  if (!questions?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Example questions">
      <span className="text-sm text-ink-muted">Try:</span>
      {questions.map((q) => <button key={q} type="button" className="min-h-[44px] rounded-full border border-line bg-input px-4 text-left text-sm text-ink-soft hover:border-[var(--accent)] hover:text-ink" onClick={() => onPick(q)}>{q}</button>)}
    </div>
  );
}
