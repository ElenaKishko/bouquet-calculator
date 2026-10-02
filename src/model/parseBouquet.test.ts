import { describe, expect, it } from 'vitest';
import catalog from '../data/catalog.json';
import { applyOps, EMPTY_BOUQUET } from './bouquet';
import { mergeItems } from './items';
import { buildNameIndex, parseBouquet, tokenize } from './parseBouquet';
import type { CatalogItem } from './types';

const items = mergeItems(catalog as CatalogItem[], {});
const index = buildNameIndex(items);

/** Parses a phrase and returns the resulting bouquet as { itemId: quantity }. */
function bouquetOf(text: string) {
  const { ops, unknown } = parseBouquet(text, index);
  const bouquet = applyOps(EMPTY_BOUQUET, ops);
  return {
    lines: Object.fromEntries(bouquet.lines.filter((line) => line.unit !== 'pack').map((line) => [line.itemId, line.quantity])),
    packs: Object.fromEntries(bouquet.lines.filter((line) => line.unit === 'pack').map((line) => [line.itemId, line.quantity])),
    lumps: Object.fromEntries(bouquet.lumps.map((lump) => [lump.label, lump.amount])),
    unknown,
  };
}

describe('tokenize', () => {
  it('splits digits glued to words and handles currency', () => {
    expect(tokenize('ירוק ב-40 ש"ח')).toEqual(['ירוק', 'ב', '40', 'שקל']);
    expect(tokenize('₪40')).toEqual(['₪', '40']);
    expect(tokenize('2.5 ורדים.')).toEqual(['2.5', 'ורדים', '|']);
    expect(tokenize('שלוש, ארבע')).toEqual(['שלוש', '|', 'ארבע']);
  });
});

describe('parseBouquet', () => {
  it('reads the real Whisper result from the iPhone test', () => {
    const result = bouquetOf('שלוש אורטנזיה, ארבע אלסטרומריה, שלוש אקליפטוס, ושני ענפים של אופרים.');
    expect(result.lines).toEqual({
      hydrangea: 3,
      alstroemeria: 4,
      'eucalyptus-pulverulenta': 3,
      'lepidium-green-bell': 2,
    });
    expect(result.unknown).toEqual([]);
  });

  it('reads Whisper digits', () => {
    expect(bouquetOf('שלוש הידרנגאה, 4, ליזינטוס, חמישה יקליפטוס').lines).toEqual({
      hydrangea: 3,
      lisianthus: 4,
      'eucalyptus-pulverulenta': 5,
    });
  });

  it('replaces a quantity when the item is repeated', () => {
    expect(bouquetOf('שלוש הידרנגאה… לא, ארבע הידרנגאה').lines).toEqual({ hydrangea: 4 });
  });

  it('corrects the last item when only a number follows "no"', () => {
    expect(bouquetOf('שלוש הורטנזיה, לא, ארבע').lines).toEqual({ hydrangea: 4 });
  });

  it('adds with "more"', () => {
    expect(bouquetOf('שלוש ורדים ועוד שניים ורדים').lines).toEqual({ rose: 5 });
  });

  it('removes with "without"', () => {
    expect(bouquetOf('שלוש הורטנזיה, חמישה אקליפטוס, בלי אקליפטוס').lines).toEqual({ hydrangea: 3 });
  });

  it('reads greenery as one amount', () => {
    const result = bouquetOf('שתי חרציות ענף ושבעה ורדים, כל הירוק ארבעים שקל.');
    expect(result.lines).toEqual({ 'chrysanthemum-spray-extra': 2, rose: 7 });
    expect(result.lumps).toEqual({ greenery: 40 });
  });

  it('reads amounts in other currencies', () => {
    expect(bouquetOf('вся зелень 40 евро').lumps).toEqual({ greenery: 40 });
    expect(bouquetOf('all greenery 40€').lumps).toEqual({ greenery: 40 });
  });

  it('reads greenery amount without the currency word', () => {
    expect(bouquetOf('כל הירוק 40').lumps).toEqual({ greenery: 40 });
  });

  it('tells spray chrysanthemum from single-head', () => {
    expect(bouquetOf('חמש חרציות ושלוש חרצית ראש').lines).toEqual({
      'chrysanthemum-spray-extra': 5,
      'chrysanthemum-disbud': 3,
    });
  });

  it('tells a plain rose from a named variety', () => {
    expect(bouquetOf('שלושה ורדים ושני ורד אנגלי').lines).toEqual({ rose: 3, 'rose-english': 2 });
  });

  it('understands Russian and English names inside Hebrew', () => {
    expect(bouquetOf('חמישה эвкалипт, שלוש гортензии, שתיים lisianthus').lines).toEqual({
      'eucalyptus-pulverulenta': 5,
      hydrangea: 3,
      lisianthus: 2,
    });
  });

  it('understands Russian names written in Hebrew letters', () => {
    expect(bouquetOf('חמישה אוקליפט').lines).toEqual({ 'eucalyptus-pulverulenta': 5 });
  });

  it('understands a fully Russian phrase', () => {
    const result = bouquetOf('три гортензии, две хризантемы кустовые, четыре лизиантуса, вся зелень 40 шекелей');
    expect(result.lines).toEqual({ hydrangea: 3, 'chrysanthemum-spray-extra': 2, lisianthus: 4 });
    expect(result.lumps).toEqual({ greenery: 40 });
  });

  it('reads compound numbers', () => {
    expect(bouquetOf('עשרים וחמישה ורדים').lines).toEqual({ rose: 25 });
    expect(bouquetOf('חמישה עשר ליזיאנטוס').lines).toEqual({ lisianthus: 15 });
  });

  it('takes a number said after the name', () => {
    expect(bouquetOf('הורטנזיה שלוש, אלסטרומריה ארבע').lines).toEqual({ hydrangea: 3, alstroemeria: 4 });
  });

  it('does not mistake short everyday words for flowers', () => {
    expect(bouquetOf('ומשהו').lines).toEqual({});
  });

  it('does not match a short word to a much longer name', () => {
    // Whisper output from a near-silent recording on the iPhone.
    expect(bouquetOf('ערבת וידה.').lines).toEqual({});
  });

  it('ignores typical Whisper phrases from silence', () => {
    expect(bouquetOf('תודה רבה.').lines).toEqual({});
  });

  it('matches short names in plural', () => {
    expect(bouquetOf('три розы').lines).toEqual({ rose: 3 });
    expect(bouquetOf('three roses').lines).toEqual({ rose: 3 });
  });

  it('reads packs in Hebrew', () => {
    expect(bouquetOf('חבילה לימוניום').packs).toEqual({ 'limonium-emille': 1 });
    expect(bouquetOf('חבילת לימוניום').packs).toEqual({ 'limonium-emille': 1 });
    expect(bouquetOf('שתי חבילות לימוניום, שלוש הורטנזיה')).toMatchObject({
      packs: { 'limonium-emille': 2 },
      lines: { hydrangea: 3 },
    });
  });

  it('reads packs in Russian, before or after the name', () => {
    expect(bouquetOf('упаковка лимониума').packs).toEqual({ 'limonium-emille': 1 });
    expect(bouquetOf('две упаковки эвкалипта').packs).toEqual({ 'eucalyptus-pulverulenta': 2 });
    expect(bouquetOf('лимониум две упаковки').packs).toEqual({ 'limonium-emille': 2 });
  });

  it('reads packs when Whisper loses the ח or writes Russian in Hebrew letters', () => {
    expect(bouquetOf('אבילה לימוניום אמילי').packs).toEqual({ 'limonium-emille': 1 });
    expect(bouquetOf('אופקובקה לימוניום').packs).toEqual({ 'limonium-emille': 1 });
  });

  it('does not take "בל" in "גרין בל" for a pack word', () => {
    expect(bouquetOf('שתיים גרין בל')).toMatchObject({ lines: { 'lepidium-green-bell': 2 }, packs: {} });
  });

  it('keeps stems and packs of the same item apart', () => {
    expect(bouquetOf('חבילה לימוניום ועוד שלוש לימוניום')).toMatchObject({
      packs: { 'limonium-emille': 1 },
      lines: { 'limonium-emille': 3 },
    });
  });

  it('defaults to one when no number is said', () => {
    expect(bouquetOf('הורטנזיה').lines).toEqual({ hydrangea: 1 });
  });

  it('reports words it could not match', () => {
    const result = bouquetOf('שלוש הורטנזיה ומשהו מוזר לגמרי');
    expect(result.lines).toEqual({ hydrangea: 3 });
    expect(result.unknown.join(' ')).toContain('מוזר');
  });
});
