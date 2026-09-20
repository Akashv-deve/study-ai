'use client';
import React, { useState } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-sql';

type TokenValue = string | { type: string; content: TokenValue | TokenValue[]; alias?: string | string[] };
const aliases: Record<string, string> = { js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', sh: 'bash', shell: 'bash', html: 'markup', xml: 'markup' };
const tone: Record<string, string> = { comment: 'text-zinc-500', string: 'text-emerald-300', keyword: 'text-pink-300', function: 'text-blue-300', number: 'text-amber-300', boolean: 'text-amber-300', operator: 'text-zinc-200', punctuation: 'text-zinc-400', property: 'text-cyan-300', tag: 'text-pink-300', 'attr-name': 'text-cyan-300', 'class-name': 'text-violet-300' };

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1600); };
  return <button type="button" onClick={() => void copy()} className="float-right rounded px-1.5 py-0.5 text-[10px] normal-case text-zinc-400 hover:bg-zinc-800 hover:text-white">{copied ? 'Copied' : 'Copy code'}</button>;
}

function renderToken(value: TokenValue | TokenValue[], key = 'token'): React.ReactNode {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item, index) => <React.Fragment key={`${key}-${index}`}>{renderToken(item, `${key}-${index}`)}</React.Fragment>);
  const className = tone[value.type] || (Array.isArray(value.alias) ? tone[value.alias[0]] : tone[value.alias || '']) || 'text-zinc-200';
  return <span className={className}>{renderToken(value.content, `${key}-${value.type}`)}</span>;
}

function HighlightedCode({ source, language }: { source: string; language: string }) {
  const normalized = aliases[language.toLowerCase()] || language.toLowerCase();
  const grammar = Prism.languages[normalized];
  const tokens = grammar ? Prism.tokenize(source, grammar) as TokenValue[] : [source];
  return <pre className="my-3 overflow-x-auto rounded-md border border-[#30363d] bg-[#0d1117] p-3 text-[11px] leading-relaxed"><span className="mb-2 block text-[10px] uppercase text-zinc-500">{normalized || 'code'}<CopyCodeButton code={source} /></span><code>{renderToken(tokens)}</code></pre>;
}

// AI output becomes React text nodes, never injected HTML. Incomplete fences remain valid code blocks while streaming.
function inline(value: string) {
  return value.split(/(`[^`]+`|\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('`')) return <code key={index} className="rounded bg-zinc-900 px-1 py-0.5 text-blue-200">{part.slice(1, -1)}</code>;
    if (part.startsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('_')) return <em key={index}>{part.slice(1, -1)}</em>;
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

export function MarkdownResponse({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n'); const nodes: React.ReactNode[] = []; let inCode = false; let language = ''; let code: string[] = [];
  const flush = () => { if (!inCode) return; nodes.push(<HighlightedCode key={`code-${nodes.length}`} language={language} source={code.join('\n')} />); code = []; inCode = false; };
  lines.forEach((line, index) => { if (line.startsWith('```')) { if (inCode) flush(); else { inCode = true; language = line.slice(3).trim(); } return; } if (inCode) { code.push(line); return; } if (/^###\s+/.test(line)) nodes.push(<h4 key={index} className="mt-4 text-sm font-semibold text-white">{inline(line.slice(4))}</h4>); else if (/^##\s+/.test(line)) nodes.push(<h3 key={index} className="mt-4 text-base font-semibold text-white">{inline(line.slice(3))}</h3>); else if (/^#\s+/.test(line)) nodes.push(<h2 key={index} className="mt-4 text-lg font-semibold text-white">{inline(line.slice(2))}</h2>); else if (/^[-*]\s+/.test(line)) nodes.push(<div key={index} className="flex gap-2 pl-2"><span className="text-blue-400">•</span><span>{inline(line.slice(2))}</span></div>); else if (/^\d+\.\s+/.test(line)) nodes.push(<div key={index} className="pl-2">{inline(line)}</div>); else if (line) nodes.push(<p key={index} className="my-2">{inline(line)}</p>); }); flush();
  return <div className="font-sans text-xs leading-6 text-zinc-200">{nodes}</div>;
}
