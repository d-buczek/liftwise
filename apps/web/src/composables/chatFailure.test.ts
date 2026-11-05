import { providerSchema } from '@liftwise/core';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vite-plus/test';
import { defineComponent } from 'vue';
import { i18n } from '../i18n';
import { useChatFailureText } from './chatFailure';

enableAutoUnmount(afterEach);

function failureText() {
  let result!: ReturnType<typeof useChatFailureText>;
  mount(
    defineComponent({
      setup() {
        result = useChatFailureText();
        return () => null;
      },
    }),
    { global: { plugins: [i18n] } },
  );
  return result;
}

it('names the provider without a key, by its Polish label', () => {
  expect(failureText()({ code: 'provider_unavailable', provider: 'google' })).toBe(
    'Gemini nie ma klucza API na serwerze. Wybierz innego dostawcę w ustawieniach modeli.',
  );
});

it('has a label for every provider of core', () => {
  const missing = providerSchema.options.filter(
    (provider) => !i18n.global.te(`models.providers.${provider}`),
  );
  expect(missing).toEqual([]);
});

it("prefers the agent's wording: a rejected message isn't the pairing form's error", () => {
  expect(failureText()({ code: 'invalid_request' })).toBe(
    'Serwer nie przyjął wiadomości. Skróć ją i spróbuj ponownie.',
  );
});

it('falls back to the general API error messages', () => {
  const text = failureText();
  expect(text({ code: 'unreachable' })).toBe(
    'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.',
  );
  expect(text({ code: 'unauthorized' })).toBe(
    'Token jest nieprawidłowy albo to urządzenie zostało odwołane.',
  );
});

it('says something useful for a code it does not know, never the code', () => {
  expect(failureText()({ code: 'brand_new_code' })).toBe(
    'Nieoczekiwany błąd serwera. Spróbuj ponownie.',
  );
});
