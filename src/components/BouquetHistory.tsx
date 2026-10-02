// "Recent bouquets" under the calculator: bouquets saved by "New bouquet".

import { useState } from 'react';
import { useI18n } from '../i18n';
import { isToday, todaySummary, type HistoryEntry } from '../model/history';
import { displayName } from '../model/items';
import { useAppStore } from '../store/AppStore';
import { useMoney } from '../useMoney';

interface BouquetHistoryProps {
  history: HistoryEntry[];
  onRestore: (entry: HistoryEntry) => void;
  onDelete: (entry: HistoryEntry) => void;
  onClear: () => void;
}

export function BouquetHistory({ history, onRestore, onDelete, onClear }: BouquetHistoryProps) {
  const { t, locale } = useI18n();
  const { items } = useAppStore();
  const { money } = useMoney();
  const [openId, setOpenId] = useState<string | null>(null);
  if (history.length === 0) return null;

  const byId = new Map(items.map((item) => [item.id, item]));
  const summary = todaySummary(history);
  const time = (entry: HistoryEntry) => {
    const date = new Date(entry.savedAt);
    const clock = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    return isToday(entry) ? clock : `${date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} ${clock}`;
  };

  return (
    <section className="card history">
      <div className="history-header">
        <h2 className="card-title">{t.history.title}</h2>
        {summary.count > 0 && <span className="muted small">{t.history.today(summary.count, money(summary.total))}</span>}
      </div>
      <ul className="history-list">
        {history.map((entry) => {
          const open = openId === entry.id;
          return (
            <li key={entry.id} className="history-entry">
              <button
                type="button"
                className="history-row"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : entry.id)}
              >
                <span>
                  {t.history.bouquet(entry.number)} <span className="muted small">· {time(entry)}</span>
                </span>
                <strong>{money(entry.total)}</strong>
              </button>
              {open && (
                <div className="history-details">
                  <ul>
                    {entry.lines.map((line) => {
                      const item = byId.get(line.itemId);
                      return (
                        <li key={`${line.itemId}:${line.unit}`}>
                          <span>
                            {item ? displayName(item, locale) : line.itemId} × {line.quantity}
                            {line.unit === 'pack' ? ` ${t.common.packUnit}` : ''}
                          </span>
                          <span>{line.total == null ? t.common.noPrice : money(line.total)}</span>
                        </li>
                      );
                    })}
                    {entry.lumps.map((lump) => (
                      <li key={lump.label}>
                        <span>{lump.label === 'greenery' ? t.calculator.lumpGreenery : t.calculator.lumpExtra}</span>
                        <span>{money(lump.amount)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="actions-row">
                    <button type="button" onClick={() => onRestore(entry)}>
                      {t.history.restore}
                    </button>
                    <button type="button" onClick={() => onDelete(entry)}>
                      {t.history.delete}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          if (window.confirm(t.history.confirmClear)) onClear();
        }}
      >
        {t.history.clear}
      </button>
    </section>
  );
}
