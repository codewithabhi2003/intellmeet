import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { copyText } from '../../lib/meetingLink';

function CopyField({ label, value, button, mono = false }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    if (await copyText(value)) { setDone(true); toast.success(`${label} copied`); setTimeout(() => setDone(false), 1800); }
    else toast.error('Could not copy automatically. Select the text and copy it.');
  };
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex items-stretch gap-2">
        <input readOnly aria-label={label} value={value} onFocus={(e) => e.target.select()} className={`field ${mono ? 'mono' : ''}`} />
        <button type="button" className="btn-secondary shrink-0 !px-4" onClick={copy} aria-label={button}>
          {done ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}{done ? 'Copied' : button}
        </button>
      </div>
    </div>
  );
}

// The meeting link and code, each with its own copy button. Used before the meeting starts (Create meeting) and inside the call ("Add people").
export default function MeetingLinkBox({ link, code, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`}>
      <CopyField label="Meeting link" value={link} button="Copy link" />
      <CopyField label="Meeting code" value={code} button="Copy code" mono />
    </div>
  );
}