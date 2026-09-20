export const IGNORED_DIRECTORIES = new Set([
  'node_modules', '.git', '.github', '.gitlab', 'dist', 'build', 'coverage', '.cache',
  '.next', '.nuxt', '__pycache__', 'venv', '.venv', 'target', 'vendor', '.idea',
  '.vscode', '.turbo', '.output', '.gradle', '.dart_tool', '.flutter-plugins',
  '.flutter-plugins-dependencies', '.packages', '.pub-cache', 'Pods', 'DerivedData',
  'android/.gradle', 'android/build', 'android/app/build', 'ios/Pods', 'web/build',
  'macos/Pods', 'linux/build', 'windows/build', '.tox', '.mypy_cache', '.pytest_cache',
  '.eggs', '__pypackages__', '.terraform', '.serverless', 'bower_components',
  'jspm_packages', '.parcel-cache', '.rollup.cache', '.webpack', '.fusebox',
  '.dynamodb', '.esbuild', '.svelte-kit', '.vercel', '.netlify'
]);

export const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'pdf', 'mp4', 'mov', 'zip', 'tar', 'gz',
  'bin', 'jar', 'class', 'ser', 'dll', 'exe', 'so', 'dylib', 'iso', '7z', 'rar', 'bz2',
  'xz', '7zip', 'woff', 'woff2', 'ttf', 'eot', 'otf', 'mp3', 'wav', 'ogg', 'flac', 'aac'
]);

export const IGNORED_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', '.DS_Store', 'Thumbs.db'
]);

export function isIgnoredDirectory(name: string): boolean {
  return IGNORED_DIRECTORIES.has(name.toLowerCase());
}

export function isBinaryFile(extension: string): boolean {
  return BINARY_EXTENSIONS.has(extension.toLowerCase().replace(/^\./, ''));
}

export function isIgnoredFile(name: string): boolean {
  return IGNORED_FILES.has(name);
}
