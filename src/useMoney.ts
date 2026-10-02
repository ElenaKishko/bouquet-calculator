import { currencySymbol, formatMoney } from './model/currency';
import { useAppStore } from './store/AppStore';

/** Formats amounts in the currency chosen in Settings. */
export function useMoney() {
  const { settings } = useAppStore();
  return {
    money: (amount: number) => formatMoney(amount, settings.currency),
    symbol: currencySymbol(settings.currency),
  };
}
