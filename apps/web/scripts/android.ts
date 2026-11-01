// The Android app (SPEC §6.10), from the repo root: `pnpm android:build` and
// `pnpm android:install [ip:port]`. Builds the web app against the API in `.env.android.local`,
// copies it into android/, builds the signed release APK and installs it over ADB (Wireless
// debugging). One-time setup: docs/android.md.
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ENV_FILE = '.env.android.local';
const APK_DIR = join('android', 'app', 'build', 'outputs', 'apk', 'release');
const windows = process.platform === 'win32';

const [command, address] = process.argv.slice(2);
if ((command !== 'build' && command !== 'install') || (address && !/^[\w.-]+:\d+$/.test(address))) {
  console.error('Usage: android.ts build | install [ip:port]');
  process.exit(1);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// Android Studio's default SDK location unless ANDROID_HOME says otherwise.
const androidHome =
  process.env.ANDROID_HOME ??
  process.env.ANDROID_SDK_ROOT ??
  (windows
    ? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Android', 'Sdk')
    : join(homedir(), 'Android', 'Sdk'));
const env = { ...process.env, ANDROID_HOME: androidHome };

// Fixed command lines only: `.cmd` and `.bat` files need a shell on Windows.
function run(line: string, cwd = '.') {
  execSync(line, { cwd, env, stdio: 'inherit' });
}

function build() {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  if (!process.env.VITE_API_URL)
    fail(`Set VITE_API_URL in apps/web/${ENV_FILE} (docs/android.md).`);
  run('vp build --mode android');
  run('cap sync android');
  // A signed APK left from an earlier build must not hide an unsigned one.
  rmSync(APK_DIR, { recursive: true, force: true });
  run(windows ? '.\\gradlew.bat assembleRelease' : './gradlew assembleRelease', 'android');
  if (!existsSync(join(APK_DIR, 'app-release.apk')))
    fail('The APK is unsigned: set the LIFTWISE_* signing properties (docs/android.md).');
}

// adb's own message on failure, e.g. INSTALL_FAILED_USER_RESTRICTED (docs/android.md).
function adb(...args: string[]): string {
  const local = join(androidHome, 'platform-tools', windows ? 'adb.exe' : 'adb');
  try {
    return execFileSync(existsSync(local) ? local : 'adb', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const { stderr } = error as { stderr?: string };
    fail(stderr?.trim() || String(error));
  }
}

build();
if (command === 'install') {
  // Without an address adb uses the one connected device (a paired phone reconnects by itself).
  if (address) {
    const output = adb('connect', address);
    if (!output.includes('connected to')) fail(output.trim());
  }
  const device = address ? ['-s', address] : [];
  console.log(adb(...device, 'install', '-r', join(APK_DIR, 'app-release.apk')).trim());
}
