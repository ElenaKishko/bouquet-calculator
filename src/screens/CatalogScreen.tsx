// Price lookup for anyone in the shop (SPEC §10): photos and sale prices only.

import { useMemo, useState } from 'react';
import { ItemPhoto } from '../components/ItemPhoto';
import { SearchBar } from '../components/SearchBar';
import { Sheet } from '../components/Sheet';
import { useI18n } from '../i18n';
import { displayName, searchText } from '../model/items';
import { salePricePerPack, salePricePerStem } from '../model/pricing';
import type { Category, Item } from '../model/types';
import { useAppStore } from '../store/AppStore';
import { useMoney } from '../useMoney';

export type CategoryFilter = 'all' | Category;

export function CategoryTabs({
  value,
  onChange,
}: {
  value: CategoryFilter;
  onChange: (value: CategoryFilter) => void;
}) {
  const { t } = useI18n();
  const options: [CategoryFilter, string][] = [
    ['all', t.common.all],
    ['flower', t.common.flowers],
    ['greenery', t.common.greenery],
  ];
  return (
    <div className="segmented" role="group">
      {options.map(([option, label]) => (
        <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function CatalogScreen() {
  const { t, locale } = useI18n();
  const { items, settings } = useAppStore();
  const { money } = useMoney();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [opened, setOpened] = useState<Item | null>(null);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (
      items
        .filter((item) => !item.hidden)
        .filter((item) => filter === 'all' || item.category === filter)
        .filter((item) => !needle || searchText(item).includes(needle))
        .map((item) => {
          // No price per stem yet (e.g. stems per pack unknown): show the pack price instead.
          const perStem = salePricePerStem(item, items, settings);
          const perPack = perStem == null ? salePricePerPack(item, items, settings) : null;
          return { item, price: perStem ?? perPack, isPackPrice: perPack != null };
        })
        // Items with a price first: that's what people come here to look up.
        .sort(
          (a, b) =>
            Number(a.price == null) - Number(b.price == null) ||
            displayName(a.item, locale).localeCompare(displayName(b.item, locale), locale),
        )
    );
  }, [items, settings, query, filter, locale]);

  return (
    <div className="screen catalog">
      <SearchBar value={query} onChange={setQuery} placeholder={t.catalog.searchPlaceholder}>
        <CategoryTabs value={filter} onChange={setFilter} />
      </SearchBar>

      <div className="search-results">
        {shown.length === 0 ? (
          <p className="muted">{t.catalog.noResults}</p>
        ) : (
          <ul className="catalog-grid">
            {shown.map(({ item, price, isPackPrice }) => (
              <li key={item.id}>
                <button type="button" className="catalog-card" onClick={() => setOpened(item)}>
                  <ItemPhoto item={item} size="medium" />
                  <span className="catalog-name">{displayName(item, locale)}</span>
                  <span className={price == null ? 'catalog-price no-price' : 'catalog-price'}>
                    {price == null
                      ? t.common.noPrice
                      : `${money(price)}${isPackPrice ? ` ${t.common.perPack}` : ''}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {opened && (
        <Sheet title={displayName(opened, locale)} onClose={() => setOpened(null)}>
          <div className="item-details">
            <ItemPhoto item={opened} size="large" />
            <p className="details-price">
              {(() => {
                const perStem = salePricePerStem(opened, items, settings);
                if (perStem != null) return `${money(perStem)} ${t.common.perStem}`;
                const perPack = salePricePerPack(opened, items, settings);
                return perPack == null ? t.common.noPrice : `${money(perPack)} ${t.common.perPack}`;
              })()}
            </p>
            <ul className="details-names">
              {opened.names.he && <li dir="rtl">{opened.names.he}</li>}
              {opened.names.ru && <li>{opened.names.ru}</li>}
              {opened.names.en && <li>{opened.names.en}</li>}
            </ul>
          </div>
        </Sheet>
      )}
    </div>
  );
}
