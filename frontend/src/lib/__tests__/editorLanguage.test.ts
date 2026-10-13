import { describe, it, expect } from 'vitest';
import { languageForPath, languageLabel, defaultExtensionForTechnology } from '../editorLanguage';

describe('languageForPath — drives syntax highlighting by real file extension', () => {
  it.each([
    ['solution.js', 'javascript'], ['App.jsx', 'jsx'], ['solution.ts', 'typescript'], ['App.tsx', 'tsx'],
    ['solution.py', 'python'], ['Main.java', 'java'], ['index.html', 'html'], ['styles.css', 'css'],
    ['data.json', 'json'], ['README.md', 'text'], ['noextension', 'text'],
  ])('%s -> %s', (path, expected) => {
    expect(languageForPath(path)).toBe(expected);
  });

  it('is case-insensitive on the extension', () => {
    expect(languageForPath('Solution.PY')).toBe('python');
  });
});

describe('languageLabel', () => {
  it('gives a human label for every language, never undefined', () => {
    for (const lang of ['javascript', 'typescript', 'jsx', 'tsx', 'python', 'java', 'html', 'css', 'json', 'text'] as const) {
      expect(languageLabel(lang)).toBeTruthy();
    }
  });
});

describe('defaultExtensionForTechnology — used when a solution has no file list', () => {
  it.each([['html', 'html'], ['css', 'css'], ['javascript', 'js'], ['react', 'jsx'], ['python', 'py'], ['java', 'java']])('%s -> .%s', (tech, ext) => {
    expect(defaultExtensionForTechnology(tech)).toBe(ext);
  });
});
