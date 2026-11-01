import { createI18n, useI18n } from 'vue-i18n';
import pl from './locales/pl.json';

// UI is Polish (D24); English can be added as another locale file.
export type MessageSchema = typeof pl;

declare module 'vue-i18n' {
  // Makes `t('…')` keys type-checked against the Polish messages.
  export interface DefineLocaleMessage extends MessageSchema {}
}

const polishPlural = new Intl.PluralRules('pl');
const POLISH_FORMS = { one: 0, few: 1, many: 2, other: 2 } as Record<string, number>;

// Polish has three forms (1 zmiana, 2 zmiany, 5 zmian); a message with four starts with zero.
export function polishPluralIndex(choice: number, choicesLength: number): number {
  const index = POLISH_FORMS[polishPlural.select(Math.abs(choice))] ?? 2;
  if (choicesLength < 4) return Math.min(index, choicesLength - 1);
  return choice === 0 ? 0 : index + 1;
}

export const i18n = createI18n<[MessageSchema], 'pl', false>({
  legacy: false,
  locale: 'pl',
  fallbackLocale: 'pl',
  messages: { pl },
  pluralRules: { pl: polishPluralIndex },
  datetimeFormats: {
    pl: {
      time: { hour: '2-digit', minute: '2-digit' },
      day: { day: 'numeric', month: 'short', year: 'numeric' },
      dayTime: { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
      // Training days: niedziela, 1 listopada; the calendar title: listopad 2026.
      dayLong: { weekday: 'long', day: 'numeric', month: 'long' },
      dayMonth: { day: 'numeric', month: 'long' },
      month: { month: 'long', year: 'numeric' },
      weekdayShort: { weekday: 'short' },
    },
  },
  numberFormats: {
    // Weights have a 0.25 kg precision (§5.1): 32,5 / 31,25.
    pl: { kg: { maximumFractionDigits: 2 } },
  },
});

// An API error code (or `unreachable`) as a message saying what to do.
export function useErrorMessage() {
  const i18n = useI18n();
  return (code: string) =>
    i18n.te(`errors.${code}`) ? i18n.t(`errors.${code}`) : i18n.t('errors.unknown');
}
