import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const tokenPattern = /(?:mfa\.[\w-]{20,}|[\w-]{23,28}\.[\w-]{6}\.[\w-]{27,})/;
let failed = false;
for (const path of paths) {
  if (/\.(?:png|jpg|webp|ico)$/.test(path)) continue;
  let staged = '';
  try {
    staged = execFileSync('git', ['show', `:${path}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    /* removed from index */
  }
  if (
    (/(^|\/)\.env(?:\.|$)/.test(path) && !path.endsWith('.env.example')) ||
    tokenPattern.test(readFileSync(path, 'utf8')) ||
    tokenPattern.test(staged)
  ) {
    console.error(`Potential secret in tracked file: ${path}`);
    failed = true;
  }
}
const objects = execFileSync('git', ['rev-list', '--objects', '--all'], { encoding: 'utf8' })
  .trim()
  .split('\n');
for (const entry of objects) {
  const space = entry.indexOf(' ');
  if (space < 0) continue;
  const oid = entry.slice(0, space),
    path = entry.slice(space + 1);
  const type = execFileSync('git', ['cat-file', '-t', oid], { encoding: 'utf8' }).trim();
  if (type !== 'blob' || /\.(?:png|jpg|webp|ico)$/.test(path)) continue;
  const content = execFileSync('git', ['cat-file', 'blob', oid], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (
    (/(^|\/)\.env(?:\.|$)/.test(path) && !path.endsWith('.env.example')) ||
    tokenPattern.test(content)
  ) {
    console.error(`Potential secret in Git history: ${path} (${oid.slice(0, 12)})`);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
else
  console.log(
    `Checked ${paths.length} tracked/staged files and reachable Git history; no Discord token or private env file detected.`,
  );
