import { describe, expect, it } from 'vitest';
import { priceBouquet } from './bouquet';
import { formatPrice, roundUpToShekel, salePricePerPack, salePricePerStem } from './pricing';
import { DEFAULT_SETTINGS, type Item } from './types';

function item(overrides: Partial<Item> & { id: string }): Item {
  return { custom: false, category: 'flower', names: {}, aliases: [], boughtAs: 'stem', hidden: false, ...overrides };
}

const items: Item[] = [
  item({ id: 'hydrangea', purchasePrice: 30 }),
  item({ id: 'lepidium', category: 'greenery', purchasePrice: 1.7 }),
  item({ id: 'anan', boughtAs: 'bunch', purchasePrice: 30, stemsPerBunch: 20 }),
  item({ id: 'limonium', boughtAs: 'bunch', purchasePrice: 25 }),
  item({ id: 'gerbera', purchasePrice: 1.8, multiplier: 2.5 }),
  item({ id: 'protea', fixedSalePrice: 25 }),
  item({ id: 'rose-a', group: 'rose', purchasePrice: 3 }),
  item({ id: 'rose-b', group: 'rose', purchasePrice: 2 }),
  item({ id: 'rose-c', group: 'rose' }),
  item({ id: 'rose', priceRule: { averageOfGroup: 'rose' } }),
];
const byId = (id: string) => items.find((entry) => entry.id === id)!;
const sale = (id: string) => salePricePerStem(byId(id), items, DEFAULT_SETTINGS);

describe('salePricePerStem', () => {
  it('uses ×3 for flowers and ×2 for greenery by default', () => {
    expect(sale('hydrangea')).toBe(90);
    expect(sale('lepidium')).toBeCloseTo(3.4);
  });

  it('divides a bunch price by stems per bunch', () => {
    expect(sale('anan')).toBeCloseTo(4.5);
  });

  it('has no price for a bunch without stems per bunch', () => {
    expect(sale('limonium')).toBeNull();
  });

  it('uses the item’s own multiplier', () => {
    expect(sale('gerbera')).toBeCloseTo(4.5);
  });

  it('uses a fixed sale price as is, without a purchase price', () => {
    expect(sale('protea')).toBe(25);
  });

  it('prices a plain rose at the average of priced varieties', () => {
    expect(sale('rose')).toBeCloseTo(7.5); // (3 + 2) / 2 × 3
  });
});

describe('salePricePerPack', () => {
  const pack = (id: string) => salePricePerPack(byId(id), items, DEFAULT_SETTINGS);

  it('prices a whole pack without stems per pack', () => {
    expect(pack('limonium')).toBe(75); // 25 × 3
  });

  it('agrees with the per-stem price when stems per pack are known', () => {
    expect(pack('anan')).toBe(90); // 30 × 3 = 1.50 × 3 × 20
  });

  it('has no pack price for items bought by the stem without stems per pack', () => {
    expect(pack('hydrangea')).toBeNull();
  });
});

describe('totals', () => {
  it('rounds the total up to a whole shekel', () => {
    expect(roundUpToShekel(187.4)).toBe(188);
    expect(roundUpToShekel(187)).toBe(187);
    expect(roundUpToShekel(0.1 + 0.2 + 186.7)).toBe(187);
  });

  it('adds lump sums and skips unpriced lines', () => {
    const result = priceBouquet(
      { lines: [{ itemId: 'hydrangea', quantity: 3 }, { itemId: 'limonium', quantity: 2 }], lumps: [{ label: 'greenery', amount: 40 }] },
      items,
      DEFAULT_SETTINGS,
    );
    expect(result.subtotal).toBe(310);
    expect(result.total).toBe(310);
    expect(result.unpricedCount).toBe(1);
  });

  it('prices pack lines by the pack', () => {
    const result = priceBouquet(
      { lines: [{ itemId: 'limonium', quantity: 2, unit: 'pack' }], lumps: [] },
      items,
      DEFAULT_SETTINGS,
    );
    expect(result.total).toBe(150);
    expect(result.unpricedCount).toBe(0);
  });

  it('formats prices', () => {
    expect(formatPrice(7.5)).toBe('7.50');
    expect(formatPrice(12)).toBe('12');
    expect(formatPrice(7.125)).toBe('7.13');
  });
});
