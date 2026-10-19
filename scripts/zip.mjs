// Packages only what the extension needs into dist/ for the Chrome Web Store.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const out = path.join(root, 'dist', `capchecker-${version}.zip`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.rmSync(out, { force: true });
execFileSync('zip', ['-r', '-X', '-q', out, 'manifest.json', 'icons', 'src', 'LICENSE', '-x', '*.DS_Store'], { cwd: root, stdio: 'inherit' });
console.log('wrote', path.relative(root, out), (fs.statSync(out).size / 1024).toFixed(1) + ' KB');
