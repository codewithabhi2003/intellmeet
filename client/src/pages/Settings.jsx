import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut, Moon, Sun, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import Avatar from '../components/common/Avatar';
import LanguageSelect from '../components/language/LanguageSelect';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { AVATAR_MAX_MB, AVATAR_TYPES, checkAvatarFile } from '../lib/avatar';
import * as aiService from '../services/aiService';
import * as userService from '../services/userService';
import { errorCode, errorMessage } from '../services/api';

const TABS = [['profile', 'Profile'], ['appearance', 'Appearance'], ['language', 'Language']];

function ProfileTab({ user, setUser }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const fileId = useId();
  const fileRef = useRef(null);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [formError, setFormError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  const emailChanged = email.trim().toLowerCase() !== user.email;
  const nameChanged = name.trim() !== user.name;
  const canSave = (nameChanged || emailChanged) && name.trim() && email.trim() && (!emailChanged || password) && !busy;

  const save = async (e) => {
    e.preventDefault(); setFormError(''); setBusy(true);
    try {
      const body = {};
      if (nameChanged) body.name = name.trim();
      if (emailChanged) { body.email = email.trim(); body.currentPassword = password; }
      const updated = await userService.updateMe(body);
      setUser(updated); setName(updated.name); setEmail(updated.email); setPassword('');
      toast.success('Profile saved');
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save your profile.'));
      if (errorCode(err) === 'WRONG_PASSWORD') setPassword('');
    } finally { setBusy(false); }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';                                   // lets you pick the same file again
    if (!file) return;
    const problem = checkAvatarFile(file);
    if (problem) { setPhotoError(problem); return; }
    setPhotoError(''); setPhotoBusy(true);
    try { setUser(await userService.uploadAvatar(file)); toast.success('Profile picture updated'); }
    catch (err) { setPhotoError(errorMessage(err, 'Could not upload the picture.')); }
    finally { setPhotoBusy(false); }
  };
  const removePhoto = async () => {
    setPhotoError(''); setPhotoBusy(true);
    try { setUser(await userService.removeAvatar()); toast.success('Profile picture removed'); }
    catch (err) { setPhotoError(errorMessage(err, 'Could not remove the picture.')); }
    finally { setPhotoBusy(false); }
  };
  const signOut = async () => {
    setSigningOut(true);
    try { await logout(); } finally { setSigningOut(false); }
    navigate('/', { replace: true });
  };

  return (
    <div className="max-w-md space-y-8">
      <section aria-labelledby="photo-h">
        <h2 id="photo-h" className="mb-3 text-base font-bold text-ink">Profile picture</h2>
        <div className="flex items-center gap-4">
          <Avatar user={user} size={72} />
          <div>
            <div className="flex flex-wrap gap-2">
              <input id={fileId} ref={fileRef} type="file" accept={AVATAR_TYPES.join(',')} className="peer sr-only" onChange={onFile} disabled={photoBusy} />
              <label htmlFor={fileId} className={`btn-secondary cursor-pointer !px-4 !py-2 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)] ${photoBusy ? 'opacity-60' : ''}`}><Upload size={16} aria-hidden />{photoBusy ? 'Working…' : 'Upload photo'}</label>
              {user.avatarUrl && <button type="button" className="btn-secondary !px-4 !py-2" onClick={removePhoto} disabled={photoBusy}><Trash2 size={16} aria-hidden />Remove</button>}
            </div>
            <p className="mt-2 text-xs text-ink-muted">PNG, JPEG or WebP, up to {AVATAR_MAX_MB} MB. Other people in your meetings can see it.</p>
          </div>
        </div>
        <p role="alert" aria-live="polite" className="mt-2 min-h-[1.25rem] text-sm" style={{ color: 'var(--red-text)' }}>{photoError}</p>
      </section>

      <form onSubmit={save} className="space-y-4" noValidate aria-labelledby="details-h">
        <h2 id="details-h" className="text-base font-bold text-ink">Your details</h2>
        <div><label className="label" htmlFor="pn">Name</label><input id="pn" className="field" maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label" htmlFor="pe">Email</label><input id="pe" type="email" className="field" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        {emailChanged && (
          <div>
            <label className="label" htmlFor="pp">Current password</label>
            <input id="pp" type="password" className="field" autoComplete="current-password" aria-describedby="pp-h" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p id="pp-h" className="mt-1 text-xs text-ink-muted">Needed to change your sign-in email.</p>
          </div>
        )}
        <p role="alert" aria-live="polite" className="min-h-[1.25rem] text-sm" style={{ color: 'var(--red-text)' }}>{formError}</p>
        <button type="submit" className="btn-primary" disabled={!canSave}>{busy ? 'Saving…' : 'Save changes'}</button>
      </form>

      <section aria-labelledby="session-h" className="border-t border-line pt-6">
        <h2 id="session-h" className="mb-3 text-base font-bold text-ink">Session</h2>
        <button type="button" className="btn-secondary" onClick={signOut} disabled={signingOut}><LogOut size={16} aria-hidden />{signingOut ? 'Signing out…' : 'Log out'}</button>
      </section>
    </div>
  );
}

const THEMES = [
  ['dark', 'Night', 'True black. The default.', Moon],
  ['light', 'Day', 'Light background.', Sun],
];
function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  return (
    <fieldset className="max-w-md">
      <legend className="mb-3 text-base font-bold text-ink">Theme</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {THEMES.map(([value, label, hint, Icon]) => (
          <label key={value} className={`flex min-h-[72px] cursor-pointer items-center gap-3 rounded-2xl border p-4 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--accent)] ${theme === value ? 'border-[var(--accent)] bg-accent-soft' : 'border-line bg-card'}`}>
            <input type="radio" name="theme" value={value} checked={theme === value} onChange={() => setTheme(value)} className="sr-only" />
            <Icon size={20} className="text-accent-text" aria-hidden />
            <span><span className="block text-sm font-semibold text-ink">{label}</span><span className="block text-xs text-ink-soft">{hint}</span></span>
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-muted">Your choice is saved in this browser.</p>
    </fieldset>
  );
}

function LanguageTab({ user, setUser }) {
  const [languages, setLanguages] = useState(null);
  const [prefs, setPrefs] = useState({ transcriptLanguage: user.languagePreferences?.transcriptLanguage || '', summaryLanguage: user.languagePreferences?.summaryLanguage || '', searchAnswerLanguage: user.languagePreferences?.searchAnswerLanguage || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { aiService.languages().then(setLanguages).catch((e) => setError(errorMessage(e))); }, []);
  const set = (k) => (v) => setPrefs((p) => ({ ...p, [k]: v }));
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const body = Object.fromEntries(Object.entries(prefs).map(([k, v]) => [k, v || null]));
      const languagePreferences = await userService.putLanguagePreferences(body);
      setUser({ ...user, languagePreferences }); toast.success('Language preferences saved');
    } catch (err) { toast.error(errorMessage(err, 'Could not save.')); } finally { setBusy(false); }
  };
  if (error) return <p role="alert" style={{ color: 'var(--red-text)' }}>{error}</p>;
  if (!languages) return <p role="status" className="text-sm text-ink-muted">Loading…</p>;
  return (
    <form onSubmit={save} className="max-w-md space-y-4" noValidate>
      <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-ink-soft"><span className="font-semibold text-ink">How a language is chosen:</span> the language you pick on the page, then the meeting’s own setting, then your preference here, then the meeting’s primary language, then English. These preferences only affect what you see; they never change another person’s view.</p>
      <LanguageSelect label="Transcript language" value={prefs.transcriptLanguage} onChange={set('transcriptLanguage')} languages={languages.filter((l) => l.transcription)} emptyLabel="Not set" />
      <LanguageSelect label="Summary language" value={prefs.summaryLanguage} onChange={set('summaryLanguage')} languages={languages} emptyLabel="Not set" />
      <LanguageSelect label="Search answer language" value={prefs.searchAnswerLanguage} onChange={set('searchAnswerLanguage')} languages={languages} emptyLabel="Not set" />
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save preferences'}</button>
    </form>
  );
}

export default function Settings() {
  const { user, setUser } = useAuth();
  const [tab, setTab] = useState('profile');
  const refs = useRef({});
  const onKey = (e) => {
    const i = TABS.findIndex(([k]) => k === tab);
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : null;
    if (next != null) { e.preventDefault(); setTab(TABS[next][0]); refs.current[TABS[next][0]]?.focus(); }
  };
  return (
    <div>
      <h1 className="mb-5 text-2xl font-extrabold text-ink">Settings</h1>
      <div role="tablist" aria-label="Settings sections" className="mb-6 flex gap-1 border-b border-line" onKeyDown={onKey}>
        {TABS.map(([k, label]) => (
          <button key={k} ref={(el) => { refs.current[k] = el; }} role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls={`panel-${k}`} tabIndex={tab === k ? 0 : -1} type="button"
            className={`relative min-h-[44px] px-4 text-sm font-semibold ${tab === k ? 'text-ink' : 'text-ink-soft'}`} onClick={() => setTab(k)}>
            {label}{tab === k && <motion.span layoutId="settings-underline" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full" style={{ background: 'var(--accent)' }} />}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'profile' && <ProfileTab user={user} setUser={setUser} />}
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'language' && <LanguageTab user={user} setUser={setUser} />}
      </div>
    </div>
  );
}
