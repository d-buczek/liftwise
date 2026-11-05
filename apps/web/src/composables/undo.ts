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
    position: 'bottom',
    positionAnchor: restTimer(),
    ...options,
  });
  await toast.present();
}

// The rest timer of the shown page, so the toast sits above it instead of covering it; pages
// Ionic keeps in the background are hidden.
function restTimer(): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('ion-footer.lw-rest')].find(
    (footer) => !footer.closest('.ion-page-hidden'),
  );
}
