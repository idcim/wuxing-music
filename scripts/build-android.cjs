const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const env = { ...process.env, TARO_APP_PLATFORM: 'android' };
const webOnly = process.argv.includes('--web-only');
const api = new URL(env.TARO_APP_ANDROID_API_BASE || 'https://app.azure-glow.cn');
if (api.protocol !== 'https:' || api.username || api.password || api.search || api.hash || api.pathname !== '/') {
  throw new Error('安卓 API 必须是 HTTPS 站点根地址，不得包含凭证、路径或查询参数');
}
env.TARO_APP_ANDROID_API_BASE = api.origin;

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

run(process.execPath, [path.join(root, 'node_modules/@tarojs/cli/bin/taro'), 'build', '--type', 'h5']);
if (webOnly) process.exit(0);

const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT || (process.platform === 'win32'
  ? path.join(env.LOCALAPPDATA || '', 'Android/Sdk') : path.join(os.homedir(), 'Android/Sdk'));
if (!fs.existsSync(sdk)) throw new Error('未找到 Android SDK，请设置 ANDROID_HOME');
env.ANDROID_HOME = sdk;
if (process.platform === 'win32') {
  const studioJava = path.join(env.ProgramFiles || 'C:/Program Files', 'Android/Android Studio/jbr');
  if (!env.JAVA_HOME && fs.existsSync(studioJava)) env.JAVA_HOME = studioJava;
}
const java = env.JAVA_HOME ? path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
const version = spawnSync(java, ['-version'], { env, encoding: 'utf8' });
if (version.error || !/version "(?:2[1-9]|[3-9]\d)\./.test(version.stderr || '')) {
  throw new Error('安卓编译需要 Java 21 或更新版本，请设置 JAVA_HOME');
}

run(process.execPath, [path.join(root, 'node_modules/@capacitor/cli/bin/capacitor'), 'sync', 'android']);
const nativeRoot = path.join(root, 'android');
// local.properties 是本机 SDK 路径，已由 Android 模板忽略。
fs.writeFileSync(path.join(nativeRoot, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '/')}\n`);
const gradleArgs = ['assembleDebug', '--console=plain', '--no-daemon'];
if (env.WUXING_GRADLE_INIT_SCRIPT) gradleArgs.push('-I', path.resolve(env.WUXING_GRADLE_INIT_SCRIPT));
if (process.platform === 'win32') run('cmd.exe', ['/d', '/c', 'gradlew.bat', ...gradleArgs], nativeRoot);
else run('./gradlew', gradleArgs, nativeRoot);

const { version: appVersion } = require('../package.json');
const output = path.join(root, 'artifacts/android');
fs.mkdirSync(output, { recursive: true });
const name = `wuxing-music-${appVersion}-android-preview.4.apk`;
const apk = path.join(output, name);
fs.copyFileSync(path.join(nativeRoot, 'app/build/outputs/apk/debug/app-debug.apk'), apk);
const hash = crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
fs.writeFileSync(`${apk}.sha256`, `${hash}  ${name}\n`);
console.log(`\nAPK: ${apk}\nSHA256: ${hash}`);
