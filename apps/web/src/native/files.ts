import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// Hands a generated file to the user (§5.12). The Android WebView can't download a blob, so the
// app writes it to its cache and opens the share sheet (Drive, Files, mail); the browser
// downloads it. Resolves false when the user closes the share sheet without picking a target.
export async function saveFile(file: { name: string; type: string; content: string }) {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: file.name,
      data: file.content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    try {
      await Share.share({ title: file.name, files: [uri] });
    } catch (error) {
      if (String(error).includes('canceled')) return false;
      throw error;
    }
    return true;
  }
  const url = URL.createObjectURL(new Blob([file.content], { type: file.type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
