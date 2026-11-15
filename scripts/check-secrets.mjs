import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const tokenPattern = /(?:mfa\.[\w-]{20,}|[\w-]{23,28}\.[\w-]{6}\.[\w-]{27,})/;
let failed = false;
for (const path of paths) {
  if (/\.(?:png|jpg|webp|ico)$/.test(path)) continue;
  if ((/(^|\/)\.env(?:\.|$)/.test(path) && !path.endsWith('.env.example')) ||
      tokenPattern.test(readFileSync(path, 'utf8'))) {
    console.error(`Potential secret in tracked file: ${path}`);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
else console.log(`Checked ${paths.length} tracked files; no Discord token or private env file detected.`);
