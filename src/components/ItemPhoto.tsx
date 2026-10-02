import { useI18n } from '../i18n';
import { displayName } from '../model/items';
import type { Item } from '../model/types';
import { usePhotoUrl } from '../store/photos';

/** The item's photo, or a colored tile with its first letter when there is no photo yet. */
export function ItemPhoto({ item, size }: { item: Item; size: 'small' | 'medium' | 'large' }) {
  const { locale } = useI18n();
  const url = usePhotoUrl(item.photoId);
  if (url) return <img className={`item-photo item-photo-${size}`} src={url} alt="" />;
  const letter = [...displayName(item, locale).replace(/[^\p{Letter}]/gu, '')][0] ?? '·';
  return (
    <div className={`item-photo item-photo-${size} item-photo-empty is-${item.category}`} aria-hidden="true">
      {letter}
    </div>
  );
}
