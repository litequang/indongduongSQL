#!/usr/bin/env node
/* Creates ignored per-workshop deployment files; it never edits application source. */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const localPath = path.join(root, '.workshop.local.json');
const firebaseLocalPath = path.join(root, '.workshop.firebase.json');
const envPath = path.join(root, '.env.local');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (label, fallback = '') => new Promise((resolve) => rl.question(`${label}${fallback ? ` [${fallback}]` : ''}: `, (answer) => resolve(answer.trim() || fallback)));

function firebase(args, options = {}) {
  return spawnSync(process.platform === 'win32' ? 'firebase.cmd' : 'firebase', args, { cwd: root, encoding: 'utf8', ...options });
}
function commandOk(result) { return !result.error && result.status === 0; }
function parsed(text) { try { return JSON.parse(text); } catch { return null; } }
function findWebApp(value) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.appId === 'string' && (!value.platform || value.platform === 'WEB')) return value;
  for (const item of Object.values(value)) { const found = findWebApp(item); if (found) return found; }
  return null;
}
function configFromText(value) {
  const obj = parsed(value);
  const source = obj && typeof obj === 'object' ? (obj.result || obj) : {};
  const fields = { apiKey: 'VITE_FIREBASE_API_KEY', authDomain: 'VITE_FIREBASE_AUTH_DOMAIN', projectId: 'VITE_FIREBASE_PROJECT_ID', storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET', messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID', appId: 'VITE_FIREBASE_APP_ID' };
  const result = {};
  for (const [key, envKey] of Object.entries(fields)) {
    const direct = source[key];
    const match = String(value).match(new RegExp(`${key}\\s*[:=]\\s*['\"]?([^,'\"\\n}]+)`, 'i'));
    result[envKey] = typeof direct === 'string' ? direct : (match ? match[1].trim() : '');
  }
  return result;
}
function updateEnv(values) {
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = current.split(/\r?\n/).filter(Boolean);
  const remaining = lines.filter((line) => !Object.keys(values).some((key) => line.startsWith(`${key}=`)));
  const next = [...remaining, ...Object.entries(values).map(([key, value]) => `${key}=${String(value).replace(/[\r\n]/g, '')}`)];
  fs.writeFileSync(envPath, `${next.join('\n')}\n`, 'utf8');
}

(async () => {
  const version = firebase(['--version']);
  if (!commandOk(version)) {
    console.error('Firebase CLI was not found. Install firebase-tools, then run this script again.'); process.exitCode = 1; return;
  }
  const loggedIn = firebase(['login:list', '--json']);
  if (!commandOk(loggedIn)) {
    console.error('Hãy chạy firebase login rồi chạy lại setup.'); process.exitCode = 1; return;
  }
  const projectId = await ask('Firebase project ID');
  if (!/^[a-z0-9-]{6,63}$/.test(projectId)) throw new Error('Firebase project ID is not valid.');
  const projects = firebase(['projects:list', '--json']);
  if (!commandOk(projects) || !JSON.stringify(parsed(projects.stdout) || {}).includes(`\"${projectId}\"`)) {
    console.error(`Cannot access Firebase project "${projectId}". Create an empty Firebase project or request access, then run setup again.`); process.exitCode = 1; return;
  }
  const hostingSite = await ask('Hosting site');
  const hostingTarget = await ask('Hosting target', 'production');
  const companyName = await ask('Tên công ty/xưởng');
  const appName = await ask('Tên hệ thống', 'XƯỞNG IN');
  const tagline = await ask('Tagline', 'Quản lý sản xuất tập trung');
  if (!hostingSite || !companyName) throw new Error('Hosting site and company name are required.');

  let sdkText = '';
  const apps = firebase(['apps:list', 'WEB', '--project', projectId, '--json']);
  let webApp = commandOk(apps) ? findWebApp(parsed(apps.stdout)) : null;
  if (!webApp) {
    const created = firebase(['apps:create', 'WEB', `${appName} Web`, '--project', projectId, '--json']);
    webApp = commandOk(created) ? findWebApp(parsed(created.stdout)) : null;
  }
  if (webApp?.appId) {
    const sdk = firebase(['apps:sdkconfig', 'WEB', webApp.appId, '--project', projectId]);
    if (commandOk(sdk)) sdkText = sdk.stdout;
  }
  if (!sdkText) {
    console.log('Automatic Firebase Web App discovery was unavailable. Paste Firebase Web Config once (JSON or initializeApp object), then press Enter.');
    sdkText = await ask('Firebase Web Config');
  }
  const webConfig = configFromText(sdkText);
  if (!Object.values(webConfig).every(Boolean)) {
    console.error('Firebase Web Config could not be parsed. No deployment configuration was written.'); process.exitCode = 1; return;
  }

  const apply = firebase(['target:apply', 'hosting', hostingTarget, hostingSite, '--project', projectId]);
  if (!commandOk(apply)) {
    console.error(`Could not apply hosting target: ${apply.stderr || apply.stdout}`); process.exitCode = 1; return;
  }
  const productionUrl = `https://${hostingSite}.web.app`;
  const local = { projectId, hostingSite, hostingTarget, productionUrl };
  fs.writeFileSync(localPath, `${JSON.stringify(local, null, 2)}\n`, 'utf8');
  const firebaseConfig = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
  firebaseConfig.hosting.target = hostingTarget;
  fs.writeFileSync(firebaseLocalPath, `${JSON.stringify(firebaseConfig, null, 2)}\n`, 'utf8');
  updateEnv({ ...webConfig, VITE_DEPLOYMENT_MODE: 'PRODUCTION', VITE_DEFAULT_WORKSHOP_NAME: companyName, VITE_DEFAULT_WORKSHOP_SHORTNAME: appName, VITE_DEFAULT_WORKSHOP_TAGLINE: tagline, VITE_DEFAULT_WORKSHOP_WEBSITE: productionUrl });
  const setSecret = (await ask('Configure one-time bootstrap secret now? (Y/n)', 'Y')).toLowerCase();
  rl.close();
  const secretReady = setSecret !== 'n' && commandOk(firebase(['functions:secrets:set', 'WORKSHOP_BOOTSTRAP_KEY', '--project', projectId], { stdio: 'inherit' }));
  console.log(`\nNEW WORKSHOP SETUP\n\nFirebase project: ${projectId}\nHosting site: ${hostingSite}\nHosting target: ${hostingTarget}\n.env.local: CREATED\nWeb App config: READY\nBootstrap secret: ${secretReady ? 'CONFIGURED' : 'ACTION REQUIRED'}\nFirestore: MANUAL ACTION MAY BE REQUIRED\nAuthentication Email/Password: MANUAL ACTION MAY BE REQUIRED\nHosting: READY\n\nNext command:\nnode scripts/deploy-workshop.cjs\n\nIf Firebase reports a missing service, create the Firestore database and enable Authentication > Sign-in method > Email/Password once in Firebase Console.`);
})().catch((error) => { console.error(`Setup failed: ${error.message}`); process.exitCode = 1; });
