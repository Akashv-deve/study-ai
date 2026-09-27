import { describe, it, expect } from 'vitest';
import { buildHtmlDocument, normalizeSandboxMessage } from '../sandboxRunner';

describe('normalizeSandboxMessage — never trusts the sandbox iframe\'s message shape', () => {
  it('passes through a well-formed passed result', () => {
    const result = normalizeSandboxMessage({ status: 'passed', output: 'hello', errors: [] });
    expect(result.status).toBe('passed');
    expect(result.output).toBe('hello');
  });

  it('an unrecognized status defaults to "error", never silently becomes "passed"', () => {
    expect(normalizeSandboxMessage({ status: 'totally-made-up' }).status).toBe('error');
    expect(normalizeSandboxMessage({}).status).toBe('error');
    expect(normalizeSandboxMessage(null).status).toBe('error');
    expect(normalizeSandboxMessage(undefined).status).toBe('error');
  });

  it('a non-string output is dropped rather than coerced', () => {
    expect(normalizeSandboxMessage({ status: 'passed', output: 12345 }).output).toBeUndefined();
  });

  it('caps output length so a runaway console.log loop cannot balloon the stored attempt', () => {
    const huge = 'x'.repeat(50_000);
    const result = normalizeSandboxMessage({ status: 'passed', output: huge });
    expect(result.output?.length).toBe(20_000);
  });

  it('errors array is filtered to strings only and capped', () => {
    const result = normalizeSandboxMessage({ status: 'error', errors: ['ok', 42, null, 'also ok', { weird: true }] });
    expect(result.errors).toEqual(['ok', 'also ok']);
  });

  it('a non-array errors field is dropped rather than crashing', () => {
    expect(normalizeSandboxMessage({ status: 'error', errors: 'not an array' }).errors).toBeUndefined();
  });
});

describe('buildHtmlDocument — assembles the sandboxed document from the learner\'s files', () => {
  it('injects the result-capture script before </body> when the HTML file has one', () => {
    const doc = buildHtmlDocument([{ path: 'index.html', content: '<html><body><h1>Hi</h1></body></html>' }]);
    expect(doc).toContain('__practiceRun');
    expect(doc.indexOf('__practiceRun')).toBeGreaterThan(doc.indexOf('<h1>Hi</h1>'));
    expect(doc.indexOf('__practiceRun')).toBeLessThan(doc.lastIndexOf('</body>') + 20);
  });

  it('still injects the capture script when there is no </body> tag', () => {
    const doc = buildHtmlDocument([{ path: 'index.html', content: '<h1>No body tag</h1>' }]);
    expect(doc).toContain('__practiceRun');
    expect(doc).toContain('<h1>No body tag</h1>');
  });

  it('inlines CSS files as a <style> tag and JS files as a wrapped <script> tag', () => {
    const doc = buildHtmlDocument([
      { path: 'index.html', content: '<html><body></body></html>' },
      { path: 'style.css', content: 'body { color: red; }' },
      { path: 'script.js', content: 'console.log("run")' },
    ]);
    expect(doc).toContain('<style>body { color: red; }</style>');
    expect(doc).toContain('console.log("run")');
  });

  it('falls back to a minimal document when no HTML file is given (pure JS/CSS challenge)', () => {
    const doc = buildHtmlDocument([{ path: 'script.js', content: 'console.log(1)' }]);
    expect(doc).toContain('<!doctype html>');
    expect(doc).toContain('console.log(1)');
  });

  it('wraps the learner\'s JS in try/catch so a synchronous throw still reports through window.onerror', () => {
    const doc = buildHtmlDocument([{ path: 'index.html', content: '<body></body>' }, { path: 'a.js', content: 'throw new Error("boom")' }]);
    expect(doc).toMatch(/try\s*{[\s\S]*throw new Error\("boom"\)[\s\S]*}\s*catch/);
  });
});

describe('buildHtmlDocument — effective CSP (Small Issue #4)', () => {
  it('injects a Content-Security-Policy meta tag that blocks network access', () => {
    const doc = buildHtmlDocument([{ path: 'index.html', content: '<html><head></head><body></body></html>' }]);
    expect(doc).toMatch(/<meta http-equiv="Content-Security-Policy"/);
    expect(doc).toMatch(/connect-src 'none'/); // blocks fetch/XHR/WebSocket
    expect(doc).toMatch(/frame-src 'none'/); // blocks external frames
    expect(doc).toMatch(/form-action 'none'/); // blocks forms to external sites
    expect(doc).toMatch(/object-src 'none'/); // blocks plugin/object loading
    expect(doc).not.toMatch(/img-src[^;]*https:/); // no external image origin allowed
  });

  it('still installs the CSP when the learner HTML has no <head> at all', () => {
    const doc = buildHtmlDocument([{ path: 'index.html', content: '<html><body>hi</body></html>' }]);
    expect(doc).toMatch(/Content-Security-Policy/);
  });

  it('still installs the CSP for a pure-JS challenge with no HTML file', () => {
    const doc = buildHtmlDocument([{ path: 'script.js', content: 'console.log(1)' }]);
    expect(doc).toMatch(/Content-Security-Policy/);
  });

  it('captures unhandled promise rejections, not just window.onerror (Small Issue #5)', () => {
    const doc = buildHtmlDocument([{ path: 'index.html', content: '<body></body>' }]);
    expect(doc).toMatch(/unhandledrejection/);
  });

  it('has an in-page backstop timer in addition to the outer 5s timeout, so a stalled load event still reports', () => {
    const doc = buildHtmlDocument([{ path: 'index.html', content: '<body></body>' }]);
    expect(doc).toMatch(/setTimeout\(function \(\) \{ send\(errors\.length > 0 \? 'error' : 'passed'\); \}, 4500\)/);
  });
});
