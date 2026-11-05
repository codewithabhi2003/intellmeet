import '../../styles/landing.css';

const ITEMS = [
  'MEET SMARTER',
  'AI-POWERED SUMMARIES',
  'TIMESTAMPED TRANSCRIPTS',
  'SMART ACTION ITEMS',
  'SEARCHABLE MEETING KNOWLEDGE',
  'ENGLISH & HINDI',
  'LESS BUSYWORK',
  'BETTER COLLABORATION',
];

function Group({ hidden = false }) {
  return (
    <ul
      className="lp-belt__group m-0 list-none p-0"
      aria-hidden={hidden || undefined}
    >
      {ITEMS.map((text) => (
        <li key={text} className="lp-belt__item">
          {text}
          <span className="lp-belt__sep" aria-hidden="true" />
        </li>
      ))}
    </ul>
  );
}

export default function MarqueeBelt() {
  return (
    <div
      className="lp-belt"
      role="group"
      aria-label="IntellMeet highlights"
    >
      <div className="lp-belt__frame" tabIndex={0}>
        <div className="lp-belt__viewport">
          <div className="lp-belt__track">
            <Group />
            <Group hidden />
          </div>
        </div>
      </div>
    </div>
  );
}