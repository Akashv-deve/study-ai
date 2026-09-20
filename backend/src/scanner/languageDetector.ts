const EXTENSION_MAP: Record<string, string> = {
  js: 'JavaScript', jsx: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript',
  py: 'Python', java: 'Java', kt: 'Kotlin', c: 'C', cpp: 'C++', h: 'C/C++ Header',
  cs: 'C#', go: 'Go', rs: 'Rust', dart: 'Dart', swift: 'Swift', php: 'PHP',
  html: 'HTML', css: 'CSS', scss: 'SCSS', sql: 'SQL', sh: 'Shell', bash: 'Shell',
  yml: 'YAML', yaml: 'YAML', json: 'JSON', md: 'Markdown', dockerfile: 'Docker',
  toml: 'TOML', xml: 'XML', rb: 'Ruby', lua: 'Lua', r: 'R', scala: 'Scala'
};

export function detectLanguage(extension: string, fileName?: string): string {
  if (fileName && fileName.toLowerCase() === 'dockerfile') return 'Docker';
  const ext = extension.toLowerCase().replace(/^\./, '');
  return EXTENSION_MAP[ext] || 'Text';
}
