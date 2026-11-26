#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const localPath = path.join(root, '.workshop.local.json');
const firebaseConfig = path.join(root, '.workshop.firebase.json');
function run(command, args) { const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' }); if (result.status !== 0) process.exit(result.status || 1); }
if (!fs.existsSync(localPath) || !fs.existsSync(firebaseConfig)) { console.error('Local workshop configuration is missing. Run node scripts/setup-new-workshop.cjs first.'); process.exit(1); }
const config = JSON.parse(fs.readFileSync(localPath, 'utf8'));
console.log(`\nREADY TO DEPLOY\nFirebase project: ${config.projectId}\nHosting site: ${config.hostingSite}\nHosting target: ${config.hostingTarget}\n`);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question(`Type the Firebase project ID (${config.projectId}) to confirm: `, (answer) => {
  rl.close();
  if (answer.trim() !== config.projectId) { console.error('Deployment cancelled: project ID was not confirmed.'); process.exit(1); }
  run('npm', ['run', 'build']);
  run('npm', ['run', 'build', '--prefix', 'functions']);
  run(process.platform === 'win32' ? 'firebase.cmd' : 'firebase', ['deploy', '--config', firebaseConfig, '--project', config.projectId, '--only', `firestore:rules,storage,functions,hosting:${config.hostingTarget}`]);
});
