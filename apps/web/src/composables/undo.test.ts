import { toastController } from '@ionic/vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { showUndo } from './undo';

const present = vi.fn<() => Promise<void>>(async () => undefined);

function stubToast() {
  return vi
    .spyOn(toastController, 'create')
    .mockResolvedValue({ present } as unknown as HTMLIonToastElement);
}

type ToastButton = { text: string; handler: () => void };

describe('showUndo', () => {
  let create: ReturnType<typeof stubToast>;

  const shown = (call = 0) => {
    const options = create.mock.calls[call]?.[0];
    return { options, button: options?.buttons?.[0] as ToastButton };
  };

  beforeEach(() => {
    create = stubToast();
    present.mockClear();
  });
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('shows the message with "Cofnij"; only pressing it undoes, once', async () => {
    const undo = vi.fn<() => Promise<void>>(async () => undefined);
    await showUndo('Usunięto serię', undo);

    expect(present).toHaveBeenCalledTimes(1);
    expect(shown().options?.message).toBe('Usunięto serię');
    expect(shown().button.text).toBe('Cofnij');
    expect(undo).not.toHaveBeenCalled();

    shown().button.handler();
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('sits under the header of the shown page, not of a hidden page or a dialog', async () => {
    document.body.innerHTML = `
      <div class="ion-page ion-page-hidden"><ion-header id="behind"></ion-header></div>
      <div class="ion-page"><ion-header id="visible"></ion-header></div>
      <ion-modal><ion-header id="dialog"></ion-header></ion-modal>`;
    await showUndo('Usunięto serię', async () => undefined);
    expect(shown().options).toMatchObject({ position: 'top', swipeGesture: 'vertical' });
    expect(shown().options?.positionAnchor).toBe(document.getElementById('visible'));
  });

  it('takes the plain top position when the shown page has no header', async () => {
    document.body.innerHTML = `<div class="ion-page ion-page-hidden"><ion-header></ion-header></div>`;
    await showUndo('Usunięto serię', async () => undefined);
    expect(shown().options?.position).toBe('top');
    expect(shown().options?.positionAnchor).toBeUndefined();
  });

  it('tells the user when the undo fails to write', async () => {
    const failed = Promise.reject(new Error('QuotaExceededError'));
    failed.catch(() => undefined);
    await showUndo('Usunięto serię', () => failed);

    shown().button.handler();
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2), { timeout: 200 });
  });
});
