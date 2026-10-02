import { useRef, type ReactNode } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  /** Extra controls under the field (e.g. category tabs); they stick together with it. */
  children?: ReactNode;
}

/** How long the phone keyboard takes to slide up before we scroll. */
const KEYBOARD_DELAY_MS = 350;

/**
 * Search field that sticks to the top of the screen. On focus it scrolls itself
 * to the top, so the results show right under it, above the phone keyboard.
 */
export function SearchBar({ value, onChange, placeholder, autoFocus, children }: SearchBarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  return (
    <div className="search-bar" ref={barRef}>
      <input
        type="search"
        className="search-input"
        enterKeyHint="search"
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          window.setTimeout(() => barRef.current?.scrollIntoView({ block: 'start' }), KEYBOARD_DELAY_MS);
        }}
        onKeyDown={(event) => {
          // "Search" on the keyboard: hide the keyboard so the whole list is visible.
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      {children}
    </div>
  );
}
