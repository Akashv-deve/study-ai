const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const { validateZipFile } = require('../dist/utils/zip');

describe('ZIP validation', () => {
  const files = [];
  afterEach(() => files.splice(0).forEach((file) => fs.rmSync(file, { force: true })));

  function createArchive(entries) {
    const archive = new AdmZip();
    for (const [name, content] of entries) archive.addFile(name, Buffer.from(content));
    const file = path.join(os.tmpdir(), `study-ai-test-${Date.now()}-${Math.random()}.zip`);
    archive.writeZip(file); files.push(file); return file;
  }

  test('accepts a regular source archive', () => {
    expect(validateZipFile(createArchive([['src/index.ts', 'export {}']]))).toMatchObject({ valid: true });
  });

  test('rejects traversal entries', () => {
    const file = createArchive([['safe.txt', 'no']]);
    const bytes = fs.readFileSync(file);
    const source = Buffer.from('safe.txt');
    const target = Buffer.from('../evilx');
    let index = 0;
    while ((index = bytes.indexOf(source, index)) !== -1) { target.copy(bytes, index); index += source.length; }
    fs.writeFileSync(file, bytes);
    expect(validateZipFile(file)).toMatchObject({ valid: false });
  });

  test('rejects absolute paths', () => {
    const file = createArchive([['safe.txt', 'no']]);
    const bytes = fs.readFileSync(file);
    const source = Buffer.from('safe.txt');
    const target = Buffer.from('/evil.tx');
    let index = 0;
    while ((index = bytes.indexOf(source, index)) !== -1) { target.copy(bytes, index); index += source.length; }
    fs.writeFileSync(file, bytes);
    expect(validateZipFile(file)).toMatchObject({ valid: false });
  });

  test('rejects oversized entries and aggregate content', () => {
    const entry = createArchive([['src/large.txt', 'x'.repeat(1024)]]);
    expect(validateZipFile(entry, { maxEntryUncompressedSize: 100 })).toMatchObject({ valid: false });
    const total = createArchive([['a.txt', 'x'.repeat(80)], ['b.txt', 'x'.repeat(80)]]);
    expect(validateZipFile(total, { maxEntryUncompressedSize: 100, maxUncompressedSize: 100 })).toMatchObject({ valid: false });
  });

  test('rejects an oversized compressed archive before extraction', () => {
    const file = createArchive([['src/index.ts', 'export {}']]);
    expect(validateZipFile(file, { maxCompressedBytes: 1 })).toMatchObject({ valid: false });
  });
});
