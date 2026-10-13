import type { Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { java } from '@codemirror/lang-java';

export type EditorLanguage = 'javascript' | 'typescript' | 'jsx' | 'tsx' | 'python' | 'java' | 'html' | 'css' | 'json' | 'text';

/** Language id for a file path — pure and DOM-free so it's unit-testable. Unknown extensions fall back to plain text. */
export function languageForPath(path: string): EditorLanguage {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'js': case 'mjs': case 'cjs': return 'javascript';
    case 'jsx': return 'jsx';
    case 'ts': return 'typescript';
    case 'tsx': return 'tsx';
    case 'py': return 'python';
    case 'java': return 'java';
    case 'html': case 'htm': return 'html';
    case 'css': return 'css';
    case 'json': return 'json';
    default: return 'text';
  }
}

/** Human-readable label shown next to the file name. */
export function languageLabel(language: EditorLanguage): string {
  return { javascript: 'JavaScript', typescript: 'TypeScript', jsx: 'JSX (React)', tsx: 'TSX (React)', python: 'Python', java: 'Java', html: 'HTML', css: 'CSS', json: 'JSON', text: 'Plain text' }[language];
}

/** Extra file extension used when a solution has no file list and must be shown as a single code block. */
export function defaultExtensionForTechnology(technology: string): string {
  return ({ html: 'html', css: 'css', javascript: 'js', react: 'jsx', nodejs: 'js', express: 'js', mongodb: 'js', java: 'java', python: 'py' } as Record<string, string>)[technology] ?? 'txt';
}

export function extensionsForLanguage(language: EditorLanguage): Extension[] {
  switch (language) {
    case 'python': return [python()];
    case 'java': return [java()];
    case 'html': return [html()];
    case 'css': return [css()];
    case 'jsx': return [javascript({ jsx: true })];
    case 'tsx': return [javascript({ jsx: true, typescript: true })];
    case 'typescript': return [javascript({ typescript: true })];
    case 'javascript': case 'json': return [javascript()];
    default: return [];
  }
}
