import { ChallengeFile, RunResult } from '../types';

/**
 * Runs learner code entirely in the browser, inside an <iframe sandbox="allow-scripts"> with NO
 * allow-same-origin. That combination is what makes this safe: the iframe gets a fresh, opaque origin, so
 * it cannot read this app's cookies, localStorage, or session. On top of that, the generated document
 * itself carries a restrictive Content-Security-Policy (see CSP_META below) that blocks fetch/XHR/
 * WebSocket, external scripts/images/frames, and form submission — the sandbox attribute alone stops
 * same-origin access, but does NOT by itself stop the iframe's own script from making cross-origin network
 * requests, which is exactly what the CSP is for. The only channel out is postMessage, which we validate
 * before trusting.
 *
 * This never touches the backend — there is nothing here for the Render process to execute.
 */

const RUN_TIMEOUT_MS = 5000;

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; child-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none';">`;

/** Inserts the CSP meta tag into <head> if present, synthesizes a <head> if there's an <html> tag but no
 * head, or just prepends it otherwise — browsers parse a leading <meta> into an implicit head either way. */
function injectCsp(html: string): string {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${CSP_META}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${CSP_META}</head>`);
  return `${CSP_META}${html}`;
}

export function buildHtmlDocument(files: ChallengeFile[]): string {
  const html = files.find((f) => /\.html?$/i.test(f.path))?.content ?? '<!doctype html><html><body></body></html>';
  const css = files.filter((f) => /\.css$/i.test(f.path)).map((f) => f.content).join('\n');
  const js = files.filter((f) => /\.(js|jsx)$/i.test(f.path)).map((f) => f.content).join('\n');
  const capture = `
<script>
(function () {
  const logs = [];
  const errors = [];
  let sent = false;
  const send = (status) => { if (sent) return; sent = true; try { parent.postMessage({ __practiceRun: true, status, output: logs.join('\\n'), errors }, '*'); } catch (e) {} };
  ['log', 'info', 'warn', 'error'].forEach((level) => {
    const original = console[level];
    console[level] = function (...args) {
      logs.push(args.map((a) => { try { return typeof a === 'string' ? a : JSON.stringify(a); } catch (e) { return String(a); } }).join(' '));
      original.apply(console, args);
    };
  });
  window.onerror = function (message) { errors.push(String(message)); send('error'); return true; };
  window.addEventListener('unhandledrejection', function (event) {
    errors.push('Unhandled promise rejection: ' + (event && event.reason ? String(event.reason) : 'unknown'));
    send('error');
  });
  window.addEventListener('load', function () {
    setTimeout(function () { send(errors.length > 0 ? 'error' : 'passed'); }, 50);
  });
  // Belt and suspenders in case 'load' never fires (e.g. a synchronous infinite loop before it) — the
  // outer 5s runInSandbox timeout is the real backstop, but this gives a cleaner in-page result first.
  setTimeout(function () { send(errors.length > 0 ? 'error' : 'passed'); }, 4500);
})();
</script>`;
  const styleTag = css ? `<style>${css}</style>` : '';
  const scriptTag = js ? `<script>try {\n${js}\n} catch (e) { window.onerror(e.message); }</script>` : '';
  const assembled = /<\/body>/i.test(html) ? html.replace('</body>', `${styleTag}${scriptTag}${capture}</body>`) : `${html}${styleTag}${scriptTag}${capture}`;
  return injectCsp(assembled);
}

export interface SandboxRunHandle {
  cancel: () => void;
}

/** Pure normalization of whatever the sandbox iframe posted — never trusts its shape, always returns a valid RunResult. Exported separately so it's unit-testable without a real DOM/iframe. */
export function normalizeSandboxMessage(data: unknown): RunResult {
  const d = (data ?? {}) as { status?: unknown; output?: unknown; errors?: unknown };
  const status = d.status === 'passed' || d.status === 'error' ? d.status : 'error';
  const output = typeof d.output === 'string' ? d.output.slice(0, 20_000) : undefined;
  const errors = Array.isArray(d.errors) ? d.errors.filter((e): e is string => typeof e === 'string').slice(0, 50) : undefined;
  return { status, output, errors, ranAt: new Date().toISOString(), source: 'browser-sandbox', trusted: false };
}

/** Runs the given files in a disposable sandboxed iframe and resolves with the result the sandbox reports about itself. */
export function runInSandbox(files: ChallengeFile[], onResult: (result: RunResult) => void): SandboxRunHandle {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;';
  let settled = false;

  const cleanup = () => {
    window.removeEventListener('message', onMessage);
    clearTimeout(timer);
    iframe.remove();
  };
  const finish = (result: RunResult) => {
    if (settled) return;
    settled = true;
    cleanup();
    onResult(result);
  };
  function onMessage(event: MessageEvent) {
    if (event.source !== iframe.contentWindow) return; // only trust messages from OUR iframe
    const data = event.data as { __practiceRun?: boolean };
    if (!data || data.__practiceRun !== true) return;
    finish(normalizeSandboxMessage(data));
  }
  // Hard backstop: never let sandbox execution run indefinitely, regardless of what the in-page timers do.
  const timer = setTimeout(() => finish({ status: 'error', errors: ['Timed out after 5 seconds — check for an infinite loop.'], ranAt: new Date().toISOString(), trusted: false }), RUN_TIMEOUT_MS);

  window.addEventListener('message', onMessage);
  iframe.srcdoc = buildHtmlDocument(files);
  document.body.appendChild(iframe);

  return { cancel: () => finish({ status: 'error', errors: ['Cancelled.'], ranAt: new Date().toISOString(), trusted: false }) };
}
