import LanguageSelect from '../language/LanguageSelect';
export default function SummaryLanguageSelect({ value, onChange, languages }) {
  return <LanguageSelect label="Summary language" value={value} onChange={onChange} languages={languages} />;
}
