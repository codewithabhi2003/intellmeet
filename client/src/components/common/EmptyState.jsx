export default function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      {Icon && <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-text"><Icon size={22} aria-hidden /></span>}
      <h3 className="text-base font-bold text-ink">{title}</h3>
      {text && <p className="max-w-sm text-sm text-ink-soft">{text}</p>}
      {action}
    </div>
  );
}
