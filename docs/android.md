# Android app

The Capacitor app in `apps/web/android/` (SPEC §6.10, D47): built from `apps/web`, signed with your own
release keystore and installed over ADB on Wi-Fi. Commands run from the repo root.

## One-time setup on the PC

1. **Toolchain**
   - Android Studio: `winget install Google.AndroidStudio`.
   - JDK 21: `winget install Microsoft.OpenJDK.21`. The Gradle 8.14 of the Capacitor template doesn't run
     on the JDK 25 that Android Studio bundles.
   - SDK packages (Android Studio → SDK Manager, or `sdkmanager`): `platform-tools`,
     `platforms;android-36`, `build-tools;36.0.0`.
   - Environment variables: `JAVA_HOME` = the JDK 21 directory (the OpenJDK installer sets it),
     `ANDROID_HOME` = `%LOCALAPPDATA%\Android\Sdk` (the scripts fall back to this path). Open a new
     terminal afterwards.
2. **Release keystore**, outside the repo; back up the file and its password in the password manager.
   Losing it means uninstalling the app, which wipes only the local mirror.

   ```sh
   keytool -genkeypair -keystore ~/.liftwise/liftwise-release.jks -storetype PKCS12 -alias liftwise \
     -keyalg RSA -keysize 4096 -validity 36500 -dname "CN=LiftWise"
   ```

   Then in `~/.gradle/gradle.properties` (PKCS12 uses one password for the store and the key):

   ```properties
   LIFTWISE_STORE_FILE=C:/Users/<you>/.liftwise/liftwise-release.jks
   LIFTWISE_STORE_PASSWORD=<password>
   LIFTWISE_KEY_ALIAS=liftwise
   LIFTWISE_KEY_PASSWORD=<password>
   ```

3. **API origin** in `apps/web/.env.android.local` (gitignored; a change needs a new build):

   ```sh
   VITE_API_URL=https://<worker>.workers.dev
   ```

   For the dev server on this PC use `http://<PC IP on the LAN>:8787` and start the API with
   `pnpm --filter @liftwise/api dev --ip 0.0.0.0`; allow `workerd` in Windows Firewall for private
   networks. Plain HTTP is allowed only when the URL starts with `http://`.

## Pairing the phone with ADB (once per phone)

1. Settings → About phone → tap "Build number" 7× to enable developer options.
2. Developer options → **Wireless debugging** on (phone and PC on the same Wi-Fi) → "Pair device with
   pairing code".
3. `adb pair <ip:pairing port> <code>` with the address and code shown on the phone (`adb` is in
   `%ANDROID_HOME%\platform-tools`).

Some vendors add steps:
- Developer options may sit deeper in the settings, so search for them.
- A separate **Install via USB** switch may be needed there, otherwise `adb install` fails with
  `INSTALL_FAILED_USER_RESTRICTED`; confirm the install prompt on the phone.

## Build and install

- `pnpm android:install <ip:port>`: builds the web app, syncs it into `android/`, builds the signed
  release APK and installs it with `adb install -r` (data stays). The address is the one on the Wireless
  debugging screen, not the pairing port. Without it adb uses the one connected device (`adb devices`).
- `pnpm android:build`: the same without installing; the APK is in
  `apps/web/android/app/build/outputs/apk/release/app-release.apk`.

After the first install the app shows the pairing screen: on another paired device open Ustawienia →
Urządzenia, create a code and type it in.

## Rest timer on the phone

- The first rest asks for notification permission; without it the timer only vibrates while the app is
  open.
- Exact alarms: `USE_EXACT_ALARM` is granted at install on Android 13+ (allowed because the APK is
  sideloaded; Play accepts it only for alarm apps). Android 12 grants `SCHEDULE_EXACT_ALARM` by default.
- If the notification comes late with the screen locked, set Settings → Apps → LiftWise → Battery to
  "Unrestricted"; some vendors delay alarms of optimized apps, and some also have an Autostart switch
  (with it on, pending alarms survive a reboot).
- The notification channel "Koniec przerwy" can be tuned in the system settings (sound, vibration).
