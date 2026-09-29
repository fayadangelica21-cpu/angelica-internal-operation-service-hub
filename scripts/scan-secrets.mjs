// Dependency-free release check: fails if a .env file is tracked or a tracked file contains a secret-looking value.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Include staged/tracked and new non-ignored files so the check sees the working tree
// before its first commit. Ignored local env files remain intentionally out.
const files = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' }).split('\n').filter(Boolean);
const problems = [];

for (const f of files) {
  if (/(^|\/)\.env(\.[^/]+)?$/.test(f) && !/\.env\.example$/.test(f)) problems.push(`${f}: environment file is tracked`);
  if (/\.(sqlite|sqlite3|db|pem|key)$/.test(f)) problems.push(`${f}: data or key file is tracked`);
}

const patterns = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/postgres(ql)?:\/\/[^\s:@/]+:[^\s@/]+@(?!HOST|host|localhost|db\.example)[^\s/]+/, 'database URL with password'],
  [/\b(sk|rqst)[-_][A-Za-z0-9_-]{20,}/, 'API key'],
  [/\bghp_[A-Za-z0-9]{30,}/, 'GitHub token'],
];
for (const f of files) {
  if (/\.(png|jpe?g|gif|ico|woff2?|pdf|zip|lock)$/.test(f) || f.includes('package-lock.json')) continue;
  let text;
  try { text = readFileSync(f, 'utf8'); } catch { continue; }
  for (const [re, name] of patterns) if (re.test(text)) problems.push(`${f}: looks like a ${name}`);
}

if (problems.length) {
  console.error('verify:secrets FAILED');
  problems.forEach((p) => console.error(' - ' + p));
  process.exit(1);
}
console.log(`verify:secrets OK (${files.length} repository files scanned)`);
