import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ref } from 'vue';
import { listen, SpeechFailure, type SpeechHandlers } from '../native/speech';
import { useVoiceInput } from './voice';

vi.mock('../native/speech', async (original) => ({
  ...(await original<typeof import('../native/speech')>()),
  listen: vi.fn<typeof listen>(),
}));

afterEach(() => vi.resetAllMocks());

function captureListen() {
  let handlers!: SpeechHandlers;
  const stop = vi.fn<() => void>();
  vi.mocked(listen).mockImplementation(async (given) => {
    handlers = given;
    return { stop };
  });
  return { handlers: () => handlers, stop };
}

describe('useVoiceInput', () => {
  it('puts the transcript after what is already typed, live', async () => {
    const draft = ref(' wyciskanie ');
    const voice = useVoiceInput(draft);
    const { handlers, stop } = captureListen();

    voice.toggle();
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());
    expect(voice.listening.value).toBe(true);
    handlers().onText('24 kg');
    expect(draft.value).toBe('wyciskanie 24 kg');
    handlers().onText('24 kg 4x10');
    expect(draft.value).toBe('wyciskanie 24 kg 4x10');

    voice.toggle();
    expect(stop).toHaveBeenCalled();
    handlers().onEnd(null);
    expect(voice.listening.value).toBe(false);
    expect(voice.error.value).toBeNull();
  });

  it('shows why listening ended or never started', async () => {
    const draft = ref('');
    const voice = useVoiceInput(draft);
    const { handlers } = captureListen();
    voice.toggle();
    await vi.waitFor(() => expect(voice.listening.value).toBe(true));
    handlers().onEnd('no_speech');
    expect(voice.error.value).toBe('no_speech');
    expect(draft.value).toBe('');

    vi.mocked(listen).mockRejectedValueOnce(new SpeechFailure('denied'));
    voice.toggle();
    await vi.waitFor(() => expect(voice.error.value).toBe('denied'));
    expect(voice.listening.value).toBe(false);
  });
});
