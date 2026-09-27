const fs = require('fs');
const path = require('path');

/** Every dangerous pattern that could execute learner-submitted code on the server. */
const DANGEROUS_PATTERNS = [
  { name: 'child_process import', re: /require\(['"]child_process['"]\)|from\s+['"]child_process['"]/ },
  { name: 'vm module import', re: /require\(['"]vm['"]\)|from\s+['"]vm['"]/ },
  { name: 'direct eval() call', re: /[^.\w]eval\s*\(/ },
  { name: 'new Function() construction', re: /new\s+Function\s*\(/ },
  { name: 'exec/execSync/spawn/spawnSync/fork call', re: /\b(exec|execSync|spawn|spawnSync|fork)\s*\(/ },
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

describe('no arbitrary server-side code execution (Phase 19 security review)', () => {
  const srcDir = path.join(__dirname, '..', 'src');
  const files = walk(srcDir);

  test('scanned a non-trivial number of backend source files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const { name, re } of DANGEROUS_PATTERNS) {
    test(`no backend source file uses: ${name}`, () => {
      const offenders = files.filter((f) => re.test(fs.readFileSync(f, 'utf8')));
      expect(offenders.map((f) => path.relative(srcDir, f))).toEqual([]);
    });
  }

  test('the runner module documents that execution is deferred for non-browser technologies, not faked', () => {
    const runner = fs.readFileSync(path.join(srcDir, 'practice', 'runner.ts'), 'utf8');
    expect(runner).toMatch(/deferred/);
    expect(runner).toMatch(/nodejs/);
    expect(runner).toMatch(/python/);
    expect(runner).toMatch(/java/);
  });
});
