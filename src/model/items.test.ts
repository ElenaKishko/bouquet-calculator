import { describe, expect, it } from 'vitest';
import catalog from '../data/catalog.json';
import { mergeItems } from './items';
import { salePricePerStem } from './pricing';
import { DEFAULT_SETTINGS, type CatalogItem } from './types';

const base: CatalogItem[] = [
  { id: 'hydrangea', category: 'flower', names: { he: 'הורטנזיה' }, aliases: [], boughtAs: 'stem', purchasePrice: 30 },
  { id: 'tulip', category: 'flower', names: { he: 'צבעוני' }, aliases: [], boughtAs: 'stem' },
];

describe('default prices', () => {
  it('a new florist starts with the catalog prices', () => {
    const [hydrangea, tulip] = mergeItems(base, {});
    expect(hydrangea.purchasePrice).toBe(30);
    expect(tulip.purchasePrice).toBeUndefined();
  });

  it("the florist's own price wins over the default", () => {
    const [hydrangea] = mergeItems(base, { hydrangea: { id: 'hydrangea', purchasePrice: 35 } });
    expect(hydrangea.purchasePrice).toBe(35);
  });

  it('a florist who only renamed an item still gets the default price', () => {
    const [hydrangea] = mergeItems(base, { hydrangea: { id: 'hydrangea', names: { ru: 'Гортензия' } } });
    expect(hydrangea.purchasePrice).toBe(30);
  });

  it('the shipped catalog prices the everyday flowers out of the box', () => {
    const items = mergeItems(catalog as CatalogItem[], {});
    const sale = (id: string) => salePricePerStem(items.find((item) => item.id === id)!, items, DEFAULT_SETTINGS);
    expect(sale('hydrangea')).toBeGreaterThan(0);
    expect(sale('alstroemeria')).toBeGreaterThan(0);
    expect(sale('rose')).toBeGreaterThan(0);
  });
});
