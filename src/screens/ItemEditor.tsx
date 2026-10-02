// Edit one item (or create a new one): names, prices, multiplier, photo, visibility.

import { useMemo, useState } from 'react';
import { ItemPhoto } from '../components/ItemPhoto';
import { Sheet } from '../components/Sheet';
import { useI18n } from '../i18n';
import { displayName } from '../model/items';
import {
  needsStemsPerBunch,
  purchasePricePerStem,
  salePricePerPack,
  salePricePerStem,
} from '../model/pricing';
import { NAME_LANGUAGES, type BoughtAs, type Category, type Item, type NameLanguage } from '../model/types';
import { CATALOG, useAppStore, type ItemPatch } from '../store/AppStore';
import { pickFile } from '../files';
import { useMoney } from '../useMoney';

interface ItemEditorProps {
  /** The item to edit; for a new item, a blank custom item with a fresh id. */
  item: Item;
  isNew: boolean;
  onClose: () => void;
}

/** Text in a number field → number, or undefined when empty / invalid. */
function parseAmount(text: string): number | undefined {
  const value = Number(text.replace(',', '.').trim());
  return text.trim() && Number.isFinite(value) && value >= 0 ? value : undefined;
}

const amountText = (value: number | undefined) => (value == null ? '' : String(value));

export function ItemEditor({ item, isNew, onClose }: ItemEditorProps) {
  const { t, locale } = useI18n();
  const { items, settings, overrides, updateItem, addItem, removeOrResetItem, setPhoto, removePhoto } = useAppStore();
  const base = CATALOG.find((entry) => entry.id === item.id);
  const { money, symbol } = useMoney();

  const [names, setNames] = useState<Partial<Record<NameLanguage, string>>>(item.names);
  const [aliases, setAliases] = useState(item.aliases.join(', '));
  const [category, setCategory] = useState<Category>(item.category);
  const [boughtAs, setBoughtAs] = useState<BoughtAs>(item.boughtAs);
  const [stemsPerBunch, setStemsPerBunch] = useState(amountText(item.stemsPerBunch));
  const [purchasePrice, setPurchasePrice] = useState(amountText(item.purchasePrice));
  const [multiplier, setMultiplier] = useState(amountText(item.multiplier));
  const [fixedSalePrice, setFixedSalePrice] = useState(amountText(item.fixedSalePrice));
  const [hidden, setHidden] = useState(item.hidden);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const draft: Item = useMemo(
    () => ({
      ...item,
      names,
      aliases: aliases.split(',').map((alias) => alias.trim()).filter(Boolean),
      category,
      boughtAs,
      stemsPerBunch: parseAmount(stemsPerBunch),
      purchasePrice: parseAmount(purchasePrice),
      multiplier: parseAmount(multiplier),
      fixedSalePrice: parseAmount(fixedSalePrice),
      hidden,
    }),
    [item, names, aliases, category, boughtAs, stemsPerBunch, purchasePrice, multiplier, fixedSalePrice, hidden],
  );
  const withDraft = items.map((entry) => (entry.id === draft.id ? draft : entry));
  const preview = salePricePerStem(draft, withDraft, settings);
  const packPreview = boughtAs === 'bunch' ? salePricePerPack(draft, withDraft, settings) : null;
  const defaultMultiplier = category === 'greenery' ? settings.greeneryMultiplier : settings.flowerMultiplier;

  const save = async () => {
    const trimmedNames = Object.fromEntries(
      NAME_LANGUAGES.map((language) => [language, names[language]?.trim() ?? '']).filter(([, name]) => name),
    ) as Partial<Record<NameLanguage, string>>;
    if (Object.keys(trimmedNames).length === 0) {
      setError(t.editor.nameRequired);
      return;
    }
    const prices = {
      stemsPerBunch: draft.stemsPerBunch,
      purchasePrice: draft.purchasePrice,
      multiplier: draft.multiplier,
      fixedSalePrice: draft.fixedSalePrice,
      hidden: hidden || undefined,
    };
    if (isNew || !base) {
      const fields = { names: trimmedNames, aliases: draft.aliases, category, boughtAs, ...prices };
      if (isNew) addItem({ id: item.id, custom: true, ...fields });
      else updateItem(item.id, fields);
    } else {
      // Store only what differs from the built-in catalog, so catalog fixes still reach this item.
      const changedNames = Object.fromEntries(
        Object.entries(trimmedNames).filter(([language, name]) => base.names[language as NameLanguage] !== name),
      );
      const ownPrice = <K extends keyof typeof prices>(key: K) =>
        key !== 'hidden' && prices[key] === base[key as keyof typeof base] ? undefined : prices[key];
      const patch: ItemPatch = {
        stemsPerBunch: ownPrice('stemsPerBunch'),
        purchasePrice: ownPrice('purchasePrice'),
        multiplier: ownPrice('multiplier'),
        fixedSalePrice: ownPrice('fixedSalePrice'),
        hidden: prices.hidden,
        names: Object.keys(changedNames).length ? changedNames : undefined,
        aliases: draft.aliases.join('|') === base.aliases.join('|') ? undefined : draft.aliases,
        category: category === base.category ? undefined : category,
        boughtAs: boughtAs === base.boughtAs ? undefined : boughtAs,
      };
      updateItem(item.id, patch);
    }
    if (pendingPhoto) await setPhoto(item.id, pendingPhoto);
    onClose();
  };

  const choosePhoto = async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    if (isNew) setPendingPhoto(file);
    else await setPhoto(item.id, file);
  };

  const remove = () => {
    if (!window.confirm(item.custom ? t.editor.confirmDelete : t.editor.confirmReset)) return;
    removeOrResetItem(item.id);
    onClose();
  };

  const photoId = overrides[item.id]?.photoId;
  const hasPhoto = !!photoId || !!pendingPhoto;

  return (
    <Sheet
      title={isNew ? t.editor.newItem : displayName(draft, locale)}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button type="button" className="primary-button" onClick={() => void save()}>
            {t.common.save}
          </button>
        </>
      }
    >
      <div className="editor">
        <section className="editor-photo">
          <ItemPhoto item={{ ...draft, photoId }} size="large" />
          {pendingPhoto && <p className="muted small">{pendingPhoto.name}</p>}
          <div className="actions-row">
            <button type="button" onClick={() => void choosePhoto()}>
              {hasPhoto ? t.editor.changePhoto : t.editor.addPhoto}
            </button>
            {photoId && !isNew && (
              <button type="button" onClick={() => removePhoto(item.id)}>
                {t.editor.removePhoto}
              </button>
            )}
          </div>
        </section>

        <fieldset>
          <legend>{t.editor.names}</legend>
          {([
            ['he', t.editor.nameHe, 'rtl'],
            ['ru', t.editor.nameRu, 'ltr'],
            ['en', t.editor.nameEn, 'ltr'],
          ] as const).map(([language, label, dir]) => (
            <label key={language} className="field">
              <span className="field-label">{label}</span>
              <input
                dir={dir}
                value={names[language] ?? ''}
                onChange={(event) => setNames({ ...names, [language]: event.target.value })}
              />
            </label>
          ))}
          <label className="field">
            <span className="field-label">{t.editor.aliases}</span>
            <input dir="auto" value={aliases} onChange={(event) => setAliases(event.target.value)} />
            <span className="muted small">{t.editor.aliasesHint}</span>
          </label>
        </fieldset>

        <div className="field">
          <span className="field-label">{t.editor.category}</span>
          <div className="segmented" role="group">
            <button type="button" aria-pressed={category === 'flower'} onClick={() => setCategory('flower')}>
              {t.common.flowers}
            </button>
            <button type="button" aria-pressed={category === 'greenery'} onClick={() => setCategory('greenery')}>
              {t.common.greenery}
            </button>
          </div>
        </div>

        {item.priceRule ? (
          <p className="notice">{t.editor.averageRule}</p>
        ) : (
          <>
            <div className="field">
              <span className="field-label">{t.editor.boughtAs}</span>
              <div className="segmented" role="group">
                <button type="button" aria-pressed={boughtAs === 'stem'} onClick={() => setBoughtAs('stem')}>
                  {t.editor.byStem}
                </button>
                <button type="button" aria-pressed={boughtAs === 'bunch'} onClick={() => setBoughtAs('bunch')}>
                  {t.editor.byBunch}
                </button>
              </div>
            </div>
            <div className="field-row">
              <label className="field">
                <span className="field-label">{boughtAs === 'bunch' ? t.editor.purchasePriceBunch(symbol) : t.editor.purchasePrice(symbol)}</span>
                <input inputMode="decimal" value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} />
              </label>
              {boughtAs === 'bunch' && (
                <label className="field">
                  <span className="field-label">{t.editor.stemsPerBunch}</span>
                  <input inputMode="numeric" value={stemsPerBunch} onChange={(event) => setStemsPerBunch(event.target.value)} />
                </label>
              )}
            </div>
            {boughtAs === 'bunch' &&
              (needsStemsPerBunch(draft) ? (
                <p className="notice notice-warning">{t.editor.needStemsHint}</p>
              ) : (
                purchasePricePerStem(draft) != null && (
                  <p className="muted">{t.editor.purchasePerStem(money(purchasePricePerStem(draft)!))}</p>
                )
              ))}
          </>
        )}

        <div className="field-row">
          <label className="field">
            <span className="field-label">{t.editor.multiplier}</span>
            <input
              inputMode="decimal"
              value={multiplier}
              placeholder={t.editor.defaultMultiplier(defaultMultiplier)}
              onChange={(event) => setMultiplier(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">{t.editor.fixedSalePrice(symbol)}</span>
            <input inputMode="decimal" value={fixedSalePrice} onChange={(event) => setFixedSalePrice(event.target.value)} />
          </label>
        </div>
        <p className="muted small">{t.editor.fixedSaleHint}</p>

        <p className="sale-preview">
          <span>{t.editor.salePrice}</span>
          <strong>{preview == null ? t.common.noPrice : money(preview)}</strong>
        </p>
        {packPreview != null && (
          <p className="sale-preview">
            <span>{t.editor.salePricePack}</span>
            <strong>{money(packPreview)}</strong>
          </p>
        )}

        <label className="checkbox">
          <input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)} />
          <span>{t.editor.hide}</span>
        </label>

        {error && <p className="notice notice-danger">{error}</p>}

        {!isNew && (item.custom || overrides[item.id]) && (
          <button type="button" className="danger-button" onClick={remove}>
            {item.custom ? t.editor.deleteItem : t.editor.resetItem}
          </button>
        )}
      </div>
    </Sheet>
  );
}
