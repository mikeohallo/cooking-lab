#!/usr/bin/env node
/**
 * Refuses to let a key-shaped string into the repository.
 *
 * Scans every tracked file (or the staged files, with --staged) for the
 * patterns real secrets take: Anthropic and OpenAI API keys, AWS access keys,
 * GitHub tokens, private-key blocks, and a few generic `secret = "..."`
 * shapes. It is deliberately simple and deterministic: no network, no
 * dependencies, a non-zero exit when anything matches.
 *
 * This is the belt; GitHub's push protection is the braces. Neither replaces
 * the rule that keys live on the device and never in this tree.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PATTERNS = [
  { name: 'Anthropic API key', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI API key', re: /sk-(proj-|live-)?[A-Za-z0-9]{20,}/ },
  { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'private key block', re: /-----BEGIN (RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/ },
  { name: 'Supabase/JWT-shaped service key', re: /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/ },
  {
    name: 'hard-coded secret assignment',
    re: /(api[_-]?key|secret|token|password)\s*[:=]\s*["'`][A-Za-z0-9_\-/+=]{16,}["'`]/i,
  },
];

/** Files that legitimately mention these shapes without containing a secret. */
const IGNORED = new Set(['scripts/check-secrets.mjs', 'package-lock.json']);

const staged = process.argv.includes('--staged');
const listArgs = staged ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR'] : ['ls-files'];
const files = execFileSync('git', listArgs, { encoding: 'utf8' })
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !IGNORED.has(line));

let findings = 0;

for (const file of files) {
  let text;
  try {
    text = staged
      ? execFileSync('git', ['show', `:${file}`], { encoding: 'utf8' })
      : readFileSync(file, 'utf8');
  } catch {
    continue; // binary or unreadable: nothing to scan as text
  }
  if (text.includes('\u0000')) {
    continue;
  }
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    for (const { name, re } of PATTERNS) {
      if (re.test(line)) {
        findings += 1;
        console.error(`${file}:${index + 1}: looks like a ${name}`);
      }
    }
  });
}

if (findings > 0) {
  console.error(`\ncheck-secrets: ${findings} finding(s). Nothing key-shaped may be committed.`);
  process.exit(1);
}

console.log(`check-secrets: ${files.length} file(s) scanned, nothing key-shaped found.`);
