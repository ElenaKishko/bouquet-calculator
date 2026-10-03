// The florist's price table (SPEC §10): purchase prices, multipliers, editing, Excel.

import { useMemo, useState } from 'react';
import { BackupReminder } from '../components/BackupReminder';
import { ItemPhoto } from '../components/ItemPhoto';
import { SearchBar } from '../components/SearchBar';
import { saveFile, pickFile } from '../files';
import { useI18n } from '../i18n';
import { exportPricesToExcel, importPricesFromExcel } from '../model/excel';
import { displayName, newCustomId, searchText } from '../model/items';
import { needsStemsPerBunch, salePricePerPack, salePricePerStem } from '../model/pricing';
import type { Item } from '../model/types';
import { CATALOG, useAppStore } from '../store/AppStore';
import { useMoney } from '../useMoney';
import { CategoryTabs, type CategoryFilter } from './CatalogScreen';
import { ItemEditor } from './ItemEditor';

function MultiplierInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  return (
    <input
      inputMode="decimal"
      className="multiplier-input"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        const parsed = Number(event.target.value.replace(',', '.'));
        if (event.target.value.trim() && Number.isFinite(parsed) && parsed > 0) onChange(parsed);
      }}
    />
  );
}

export function PricesScreen() {
  const { t, locale } = useI18n();
  const { items, settings, overrides, updateSettings, replaceAll } = useAppStore();
  const { money } = useMoney();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [showHidden, setShowHidden] = useState(false);
  const [editing, setEditing] = useState<{ item: Item; isNew: boolean } | null>(null);
  const [message, setMessage] = useState<{
    text: string;
    danger?: boolean;
  } | null>(null);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items
      .filter((item) => showHidden || !item.hidden)
      .filter((item) => filter === 'all' || item.category === filter)
      .filter((item) => !needle || searchText(item).includes(needle))
      .sort((a, b) => displayName(a, locale).localeCompare(displayName(b, locale), locale));
  }, [items, query, filter, showHidden, locale]);

  const addItem = () => {
    const item: Item = {
      id: newCustomId(),
      custom: true,
      category: filter === 'greenery' ? 'greenery' : 'flower',
      names: {},
      aliases: [],
      boughtAs: 'stem',
      hidden: false,
    };
    setEditing({ item, isNew: true });
  };

  const exportExcel = async () => {
    const blob = await exportPricesToExcel(items, settings);
    await saveFile(blob, `bouquet-prices-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const importExcel = async () => {
    const file = await pickFile('.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (!file) return;
    try {
      const result = await importPricesFromExcel(file, CATALOG, overrides);
      replaceAll(result.overrides, { ...settings, ...result.settings }, 'import');
      setMessage({ text: t.prices.imported(result.itemCount) });
    } catch (error) {
      setMessage({
        text: t.prices.importFailed(error instanceof Error ? error.message : String(error)),
        danger: true,
      });
    }
  };

  return (
    <div className="screen prices">
      <BackupReminder />
      <section className="card multipliers">
        <h2 className="card-title">{t.prices.multipliers}</h2>
        <div className="multiplier-row">
          <label>
            <span>{t.prices.flowerMultiplier}</span>
            <MultiplierInput
              value={settings.flowerMultiplier}
              onChange={(value) => updateSettings({ flowerMultiplier: value })}
            />
          </label>
          <label>
            <span>{t.prices.greeneryMultiplier}</span>
            <MultiplierInput
              value={settings.greeneryMultiplier}
              onChange={(value) => updateSettings({ greeneryMultiplier: value })}
            />
          </label>
        </div>
      </section>

      <div className="prices-toolbar">
        <button type="button" className="primary-button compact" onClick={addItem}>
          + {t.prices.addItem}
        </button>
        <button type="button" onClick={() => void exportExcel()}>
          {t.prices.exportExcel}
        </button>
        <button type="button" onClick={() => void importExcel()}>
          {t.prices.importExcel}
        </button>
      </div>
      {message && <p className={message.danger ? 'notice notice-danger' : 'notice'}>{message.text}</p>}
      <label className="checkbox">
        <input type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} />
        <span>{t.prices.showHidden}</span>
      </label>

      <SearchBar value={query} onChange={setQuery} placeholder={t.catalog.searchPlaceholder}>
        <CategoryTabs value={filter} onChange={setFilter} />
      </SearchBar>

      <div className="search-results">
        {shown.length === 0 ? (
          <p className="muted">{t.catalog.noResults}</p>
        ) : (
          <ul className="price-list">
            {shown.map((item) => {
              const sale = salePricePerStem(item, items, settings);
              const packSale = sale == null ? salePricePerPack(item, items, settings) : null;
              return (
                <li key={item.id}>
                  <button type="button" className="price-row" onClick={() => setEditing({ item, isNew: false })}>
                    <ItemPhoto item={item} size="small" />
                    <span className="price-name">
                      <span>{displayName(item, locale)}</span>
                      <span className="muted small">
                        {item.purchasePrice != null
                          ? `${t.prices.purchase}: ${money(item.purchasePrice)}${item.boughtAs === 'bunch' ? ` ${t.prices.perBunch}` : ''}`
                          : ''}
                        {item.hidden ? ` · ${t.prices.hidden}` : ''}
                      </span>
                      {needsStemsPerBunch(item) && <span className="warning-text small">{t.prices.needStems}</span>}
                    </span>
                    <span className={sale == null && packSale == null ? 'price-sale no-price' : 'price-sale'}>
                      {sale != null
                        ? money(sale)
                        : packSale != null
                          ? `${money(packSale)} ${t.common.perPack}`
                          : t.common.noPrice}
                      {item.fixedSalePrice != null && <span className="badge">{t.prices.fixed}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editing && <ItemEditor item={editing.item} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </div>
  );
}
