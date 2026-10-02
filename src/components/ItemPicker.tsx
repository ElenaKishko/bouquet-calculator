import { useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { displayName, searchText } from '../model/items';
import type { Item } from '../model/types';
import { useAppStore } from '../store/AppStore';
import { ItemPhoto } from './ItemPhoto';
import { SearchBar } from './SearchBar';
import { Sheet } from './Sheet';

interface ItemPickerProps {
  title: string;
  onPick: (item: Item) => void;
  onClose: () => void;
}

/** Search-and-tap list of the visible items. */
export function ItemPicker({ title, onPick, onClose }: ItemPickerProps) {
  const { t, locale } = useI18n();
  const { items } = useAppStore();
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items
      .filter((item) => !item.hidden && (!needle || searchText(item).includes(needle)))
      .sort((a, b) => displayName(a, locale).localeCompare(displayName(b, locale), locale));
  }, [items, query, locale]);

  return (
    <Sheet title={title} onClose={onClose} tall>
      <SearchBar value={query} onChange={setQuery} placeholder={t.catalog.searchPlaceholder} autoFocus />
      {matches.length === 0 ? (
        <p className="muted">{t.catalog.noResults}</p>
      ) : (
        <ul className="pick-list">
          {matches.map((item) => (
            <li key={item.id}>
              <button type="button" className="pick-row" onClick={() => onPick(item)}>
                <ItemPhoto item={item} size="small" />
                <span className="pick-name">
                  <span>{displayName(item, locale)}</span>
                  {locale !== 'he' && item.names.he && (
                    <span className="muted small" dir="rtl">
                      {item.names.he}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
