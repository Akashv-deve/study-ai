const fs = require('fs');
const os = require('os');
const path = require('path');
const { scanDirectory } = require('../dist/scanner/fileScanner');
const { config } = require('../dist/config');

describe('scanner limits', () => {
  let root;
  const original = { ...config };
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'study-ai-scanner-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); Object.assign(config, original); });

  test('retains metadata but caps readable AI content', async () => {
    config.MAX_SCANNED_FILES = 10;
    config.MAX_ANALYZED_FILES = 2;
    config.MAX_READABLE_FILE_SIZE = 1024;
    config.MAX_TOTAL_READABLE_BYTES = 1024;
    for (let index = 0; index < 4; index++) fs.writeFileSync(path.join(root, `file-${index}.ts`), `export const value${index} = ${index};`);
    const result = await scanDirectory(root);
    expect(result.fileCount).toBe(4);
    expect(result.limits).toMatchObject({ reached: true, analyzedFileCount: 2 });
    expect(result.limits.reasons).toContain('max_analyzed_files');
    expect(result.files.filter((file) => file.isAnalyzed)).toHaveLength(2);
    expect(result.files.filter((file) => file.analysisStatus === 'skipped_analysis_limit')).toHaveLength(2);
  });
});
