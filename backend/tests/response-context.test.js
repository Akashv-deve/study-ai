const { responseContextKey } = require('../dist/ai/responseContext');

describe('ordinary AI response context keys', () => {
  test('keeps project, file, and exact selection contexts distinct', () => {
    expect(responseContextKey('chat')).toBe('project');
    expect(responseContextKey('file_explanation', 'src/app.ts')).toBe('src/app.ts');
    expect(responseContextKey('chat', 'src/app.ts', { code: 'x', startLine: 4, endLine: 18 })).toBe('src/app.ts:4-18');
    expect(responseContextKey('file_explanation', 'src/app.ts', { code: 'x', startLine: 5, endLine: 18 })).not.toBe('src/app.ts:4-18');
  });

  test('uses the same logical key across response types and reserves overview', () => {
    expect(responseContextKey('chat', 'src/app.ts')).toBe(responseContextKey('file_explanation', 'src/app.ts'));
    expect(responseContextKey('overview')).toBe('project-overview');
  });
});
