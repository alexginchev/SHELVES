import { bookLanguages, languageName } from "../shared/languages";
export function LanguageSelect({
  value,
  onChange,
  label = "Book language",
  name = "language",
}: {
  value: string;
  onChange?: (value: string) => void;
  label?: string;
  name?: string;
}) {
  const options = [
    ...new Set([...bookLanguages, ...(value ? [value] : [])]),
  ].sort((a, b) => languageName(a).localeCompare(languageName(b)));
  return (
    <label>
      {label}
      <select
        name={name}
        aria-label={label}
        {...(onChange
          ? {
              value,
              onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                onChange(e.target.value),
            }
          : { defaultValue: value })}
      >
        <option value="">All languages</option>
        {options.map((code) => (
          <option value={code} key={code}>
            {languageName(code)}
          </option>
        ))}
      </select>
    </label>
  );
}
