import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { i18n } from '../i18n';
import {
  listen,
  SpeechFailure,
  speechNeedsNetwork,
  speechSupported,
  type SpeechHandlers,
} from '../native/speech';
import { useSyncStore } from '../stores/sync';
import CheckinSheet from './CheckinSheet.vue';

vi.mock('../native/speech', async (original) => ({
  ...(await original<typeof import('../native/speech')>()),
  listen: vi.fn<typeof listen>(),
  speechSupported: vi.fn<typeof speechSupported>(() => false),
  speechNeedsNetwork: vi.fn<typeof speechNeedsNetwork>(() => true),
}));

enableAutoUnmount(afterEach);

let pinia: ReturnType<typeof createPinia>;

beforeEach(() => {
  pinia = createPinia();
  vi.mocked(speechSupported).mockReturnValue(false);
  vi.mocked(speechNeedsNetwork).mockReturnValue(true);
});

afterEach(() => vi.mocked(listen).mockReset());

function sheet() {
  const wrapper = mount(CheckinSheet, { global: { plugins: [i18n, pinia] } });
  // Plain <button> chips by label; the pain areas are plain buttons too.
  const chip = (label: string) => {
    const found = wrapper.findAll('button').find((candidate) => candidate.text() === label);
    if (!found) throw new Error(`no chip "${label}"`);
    return found;
  };
  // Ionic's hosts hide their textContent in the test DOM, so its buttons are found by their markup.
  const ionButton = (label: string) => {
    const found = wrapper
      .findAll('ion-button')
      .find((candidate) => candidate.html().includes(label));
    if (!found) throw new Error(`no button "${label}"`);
    return found;
  };
  const textarea = () => wrapper.find('ion-textarea').element as Element & { value: string };
  const type = (text: string) => {
    textarea().value = text;
    textarea().dispatchEvent(new CustomEvent('ionInput'));
  };
  const submit = async () => {
    await ionButton('Zaproponuj').trigger('click');
    return wrapper.emitted('submit')?.at(-1)?.[0];
  };
  const mic = () => wrapper.find('.lw-checkin__mic');
  return { wrapper, chip, ionButton, textarea, type, submit, mic };
}

it('every answer is optional: a tap on "Zaproponuj" is enough', async () => {
  const { submit } = sheet();
  expect(await submit()).toEqual({ timeMin: null, wellbeing: null, pain: [], note: '' });
});

it('hands over what was chosen', async () => {
  const { chip, type, submit } = sheet();
  await chip('60+ min').trigger('click');
  await chip('4').trigger('click');
  await chip('kolano').trigger('click');
  await chip('dół pleców').trigger('click');
  type('Mało snu');
  expect(await submit()).toEqual({
    timeMin: 60,
    wellbeing: 4,
    pain: ['knee', 'lowerBack'],
    note: 'Mało snu',
  });
});

it('a second tap takes an answer back', async () => {
  const { chip, submit } = sheet();
  for (const label of ['30 min', '3', 'bark', 'łokieć']) await chip(label).trigger('click');
  for (const label of ['30 min', '3', 'bark']) await chip(label).trigger('click');
  expect(await submit()).toEqual({ timeMin: null, wellbeing: null, pain: ['elbow'], note: '' });
});

it('a pain area shows whether it is on', async () => {
  const { chip } = sheet();
  const area = () => chip('biodro').attributes('aria-checked');
  expect(area()).toBe('false');
  await chip('biodro').trigger('click');
  expect(area()).toBe('true');
  await chip('biodro').trigger('click');
  expect(area()).toBe('false');
});

it('"Anuluj" closes without submitting', async () => {
  const { wrapper, chip, ionButton } = sheet();
  await chip('20 min').trigger('click');
  await ionButton('Anuluj').trigger('click');
  expect(wrapper.emitted('close')).toHaveLength(1);
  expect(wrapper.emitted('submit')).toBeUndefined();
});

describe('voice', () => {
  function micDisabled(mic: ReturnType<typeof sheet>['mic']) {
    return (mic().element as Element & { disabled?: boolean }).disabled;
  }

  function capture() {
    let handlers!: SpeechHandlers;
    const stop = vi.fn<() => void>();
    vi.mocked(listen).mockImplementation(async (given) => {
      handlers = given;
      return { stop };
    });
    return { handlers: () => handlers, stop };
  }

  it('no recognizer, no mic', () => {
    expect(sheet().mic().exists()).toBe(false);
  });

  it('the browser recognizer needs the network, the on-device one does not', async () => {
    vi.mocked(speechSupported).mockReturnValue(true);
    useSyncStore(pinia).online = false;
    const inBrowser = sheet();
    expect(micDisabled(inBrowser.mic)).toBe(true);

    vi.mocked(speechNeedsNetwork).mockReturnValue(false);
    const onPhone = sheet();
    expect(micDisabled(onPhone.mic)).toBe(false);
  });

  it('losing the network does not take away the button that stops listening', async () => {
    vi.mocked(speechSupported).mockReturnValue(true);
    capture();
    const { wrapper, mic } = sheet();
    await mic().trigger('click');
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());
    useSyncStore(pinia).online = false;
    await wrapper.vm.$nextTick();
    expect(micDisabled(mic)).toBe(false);
    expect(mic().attributes('aria-label')).toBe('Zakończ mówienie');
  });

  it('the transcript joins the note, and submitting stops the mic and sends it', async () => {
    vi.mocked(speechSupported).mockReturnValue(true);
    const { handlers, stop } = capture();
    const { wrapper, mic, type, textarea, submit } = sheet();
    type('Mało snu');
    await wrapper.vm.$nextTick();
    expect(mic().attributes('aria-label')).toBe('Mów');
    await mic().trigger('click');
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());
    handlers().onText('mało czasu');
    await wrapper.vm.$nextTick();
    expect(textarea().value).toBe('Mało snu mało czasu');
    const answers = await submit();
    expect(stop).toHaveBeenCalled();
    expect(answers).toMatchObject({ note: 'Mało snu mało czasu' });
  });

  it('closing the sheet stops the mic', async () => {
    vi.mocked(speechSupported).mockReturnValue(true);
    const { stop } = capture();
    const { wrapper, mic } = sheet();
    await mic().trigger('click');
    await flushPromises();
    wrapper.unmount();
    expect(stop).toHaveBeenCalled();
  });

  it('closing the sheet while the mic is still starting stops it too', async () => {
    vi.mocked(speechSupported).mockReturnValue(true);
    const stop = vi.fn<() => void>();
    let started: (session: { stop: () => void }) => void = () => undefined;
    vi.mocked(listen).mockImplementation(() => new Promise((resolve) => (started = resolve)));
    const { wrapper, mic } = sheet();
    await mic().trigger('click');
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());
    wrapper.unmount();
    started({ stop });
    await new Promise((resolve) => setTimeout(resolve));
    expect(stop).toHaveBeenCalled();
  });

  it.each([
    ['no_speech', 'Nic nie usłyszałem. Spróbuj jeszcze raz.'],
    ['denied', 'Brak dostępu do mikrofonu. Zezwól na nagrywanie dźwięku w ustawieniach.'],
  ] as const)('says why listening failed: %s', async (code, message) => {
    vi.mocked(speechSupported).mockReturnValue(true);
    vi.mocked(listen).mockRejectedValue(new SpeechFailure(code));
    const { wrapper, mic } = sheet();
    await mic().trigger('click');
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').text()).toBe(message));
    expect(mic().attributes('aria-label')).toBe('Mów');
  });
});
