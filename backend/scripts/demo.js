/**
 * Zero-setup local demo: starts a throw-away in-memory MongoDB and the Firebase Auth
 * emulator (sign-in), then the API (which also serves the built Vue app).
 *
 *   cd frontend && npm run build && cd ../backend && npm run demo
 *
 * Data (accounts included) is lost when the process exits. To use a real Identity
 * Platform project instead of the emulator, set FIREBASE_PROJECT_ID / FIREBASE_API_KEY
 * in backend/.env (and leave FIREBASE_AUTH_EMULATOR_HOST unset).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = [];

const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri('moviematch');
console.log('In-memory MongoDB started (data is temporary)');

const usingRealProject = process.env.FIREBASE_PROJECT_ID && !process.env.FIREBASE_PROJECT_ID.startsWith('demo-');
if (!usingRealProject && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  const host = '127.0.0.1:9099';
  const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-moviematch';
  console.log('Starting the Firebase Auth emulator…');
  // Run the firebase-tools CLI with this Node directly: no shell, so paths with spaces are safe.
  const firebaseCli = path.join(root, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
  const emu = spawn(process.execPath, [firebaseCli, 'emulators:start', '--only', 'auth', '--project', projectId], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(emu);
  emu.stderr.on('data', (d) => process.stderr.write(`[auth-emulator] ${d}`));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Firebase Auth emulator did not start within 60 s')), 60_000);
    emu.stdout.on('data', (d) => {
      if (/All emulators ready|Auth Emulator.*ready|emulator.*started/i.test(String(d))) { clearTimeout(timer); resolve(); }
    });
    emu.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Firebase Auth emulator exited (code ${code})`)); });
  });
  process.env.FIREBASE_AUTH_EMULATOR_HOST = host;
  process.env.FIREBASE_PROJECT_ID = projectId;
  console.log(`Firebase Auth emulator ready at http://${host} (password-reset links are printed below)`);
  // Reset emails aren't really sent by the emulator; surface the links in this console.
  emu.stdout.on('data', (d) => { if (/oobCode|resetPassword|To reset/i.test(String(d))) process.stdout.write(`[auth-emulator] ${d}`); });
}

const stop = () => {
  for (const c of children) {
    try {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
      else c.kill('SIGTERM');
    } catch { /* already gone */ }
  }
  mongod.stop();
};
process.on('exit', stop);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop(); process.exit(0); });

await import('../src/server.js');
