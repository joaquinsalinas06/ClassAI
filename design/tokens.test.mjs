import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdirSync, mkdtempSync, copyFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('generated web/Android tokens match source and pass contrast checks', () => {
  const result = spawnSync(process.execPath, ['design/build-tokens.mjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (/\.(xml|kt)$/.test(entry.name)) yield path;
  }
}

test('Android UI uses generated colors instead of a parallel palette', () => {
  const generated = readFileSync(join(root, 'mobile/android/app/src/main/res/values/ds_tokens.xml'), 'utf8');
  const colors = new Set([...generated.matchAll(/<color name="([^"]+)"/g)].map(m => m[1]));
  for (const path of files(join(root, 'mobile/android/app/src/main'))) {
    if (path.endsWith('/ds_tokens.xml')) continue;
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /#[0-9a-f]{6,8}\b|0x[0-9a-f]{6,8}\b|Color\.WHITE/i, path);
    for (const match of source.matchAll(/(?:@color\/|R\.color\.)([a-z_0-9]+)/g)) {
      assert.ok(colors.has(match[1]), `${path}: unknown or non-shared color ${match[1]}`);
    }
  }
});


test('--check rejects stale output without overwriting it', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'classai-tokens-'));
  try {
    for (const relative of ['design/build-tokens.mjs', 'design/tokens.json', 'web/src/styles/tokens.css',
      'mobile/android/app/src/main/res/values/ds_tokens.xml',
      'mobile/android/app/src/main/res/values-night/ds_tokens.xml']) {
      const destination = join(fixture, relative);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(join(root, relative), destination);
    }
    const css = join(fixture, 'web/src/styles/tokens.css');
    appendFileSync(css, '\n/* stale fixture */\n');
    const before = readFileSync(css, 'utf8');
    const result = spawnSync(process.execPath, ['design/build-tokens.mjs', '--check'], { cwd: fixture, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Stale tokens/);
    assert.equal(readFileSync(css, 'utf8'), before);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
