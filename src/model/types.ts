// Core data model. Built-in catalog items ship with the app; everything the
// florist changes or adds is stored separately (ItemOverride) on the device,
// so catalog updates never overwrite the florist's data.

import { DEFAULT_CURRENCY, type CurrencyCode } from './currency';

export const NAME_LANGUAGES = ['he', 'ru', 'en'] as const;
export type NameLanguage = (typeof NAME_LANGUAGES)[number];

export type Category = 'flower' | 'greenery';
export type BoughtAs = 'stem' | 'bunch';

/** A plain item without a variety (e.g. "rose") can be priced at the average of a group of items. */
export interface AverageOfGroup {
  averageOfGroup: string;
}

/** Built-in catalog entry (src/data/catalog.json). */
export interface CatalogItem {
  id: string;
  category: Category;
  names: Partial<Record<NameLanguage, string>>;
  /** Other names people say out loud, in any language. */
  aliases: string[];
  boughtAs: BoughtAs;
  /** Items in the same group feed a group average (e.g. standard rose varieties). */
  group?: string;
  priceRule?: AverageOfGroup;
}

/** The florist's data for one item: changes to a built-in item, or a whole custom item. */
export interface ItemOverride {
  id: string;
  /** True for items the florist added; false/undefined for built-in items. */
  custom?: boolean;
  category?: Category;
  names?: Partial<Record<NameLanguage, string>>;
  aliases?: string[];
  boughtAs?: BoughtAs;
  stemsPerBunch?: number;
  /** Price per bought unit (per stem, or per bunch when bought by the bunch). */
  purchasePrice?: number;
  /** Own multiplier; when absent the category multiplier is used. */
  multiplier?: number;
  /** Sale price per stem set directly; overrides purchase price × multiplier. */
  fixedSalePrice?: number;
  hidden?: boolean;
  /** Key of the photo in local storage. */
  photoId?: string;
}

/** Built-in data merged with the florist's override — what the screens work with. */
export interface Item {
  id: string;
  custom: boolean;
  category: Category;
  names: Partial<Record<NameLanguage, string>>;
  aliases: string[];
  boughtAs: BoughtAs;
  stemsPerBunch?: number;
  purchasePrice?: number;
  multiplier?: number;
  fixedSalePrice?: number;
  hidden: boolean;
  photoId?: string;
  group?: string;
  priceRule?: AverageOfGroup;
}

export interface Settings {
  flowerMultiplier: number;
  greeneryMultiplier: number;
  /** Whisper model size used for recognition. */
  whisperModel: 'small' | 'base';
  /** Language Whisper transcribes in; 'auto' lets the model decide. */
  whisperLanguage: 'he' | 'ru' | 'en' | 'auto';
  /** Sign shown with prices; amounts are not converted. */
  currency: CurrencyCode;
}

export const DEFAULT_SETTINGS: Settings = {
  flowerMultiplier: 3,
  greeneryMultiplier: 2,
  whisperModel: 'small',
  whisperLanguage: 'he',
  currency: DEFAULT_CURRENCY,
};
