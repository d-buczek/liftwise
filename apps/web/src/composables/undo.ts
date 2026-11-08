import { toastController, type ToastOptions } from '@ionic/vue';
import { i18n } from '../i18n';

// A manual delete or copy is immediate; the toast offers "Cofnij" for a few seconds (§5.2).
export async function showUndo(message: string, undo: () => Promise<unknown>) {
  await presentToast({
    message,
    buttons: [{ text: i18n.global.t('day.undo'), handler: () => void undo().catch(undoFailed) }],
  });
}

async function undoFailed(error: unknown) {
  console.error(error);
  await presentToast({ message: i18n.global.t('day.undoFailed'), color: 'danger' });
}

async function presentToast(options: ToastOptions) {
  const toast = await toastController.create({
    duration: 6000,
    // Under the toolbar: at the bottom it covered the buttons under the thumb (LW-25).
    position: 'top',
    positionAnchor: pageHeader(),
    swipeGesture: 'vertical',
    ...options,
  });
  await toast.present();
}

// The header of the shown page. Ionic keeps background pages hidden, and a dialog that is closing
// still has its own header.
function pageHeader(): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('ion-header')]
    .filter((header) => !header.closest('.ion-page-hidden, ion-modal'))
    .at(-1);
}
