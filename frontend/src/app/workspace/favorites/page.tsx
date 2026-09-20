'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Heart, Trash2 } from 'lucide-react';
import { MarkdownResponse } from '../../../components/ai/MarkdownResponse';
import { Button } from '../../../components/ui/Button';
import { fetchApi } from '../../../services/api';
import { FavoriteResponse } from '../../../types';

export default function FavoritesPage() {
  const [items, setItems] = useState<FavoriteResponse[]>([]); const [error, setError] = useState<string | null>(null);
  const load = () => fetchApi<FavoriteResponse[]>('/ai/favorites').then(setItems).catch((err: Error) => setError(err.message));
  useEffect(() => { void load(); }, []);
  const remove = async (id: string) => { if (!window.confirm('Remove this favourite?')) return; await fetchApi(`/ai/favorites/${id}`, { method: 'DELETE' }); void load(); };
  return <div className="max-w-4xl mx-auto p-8 space-y-6"><div><h1 className="text-2xl font-bold text-white">Favourites</h1><p className="mt-1 text-xs text-zinc-400">Saved snapshots stay available even when newer AI responses replace the original context.</p></div>{error && <p role="alert" className="text-sm text-red-300">{error}</p>}{items.length === 0 ? <div className="rounded-xl border border-dashed border-[#30363d] p-12 text-center text-zinc-500"><Heart className="mx-auto mb-3" size={24} />No saved responses yet.</div> : <div className="space-y-4">{items.map((item) => <article key={item._id} className="rounded-xl border border-[#30363d] bg-[#161b22] p-5"><div className="mb-3 flex items-start justify-between gap-4"><div><h2 className="font-semibold text-white">{item.title}</h2><p className="mt-1 text-[11px] text-zinc-500">{item.projectName} · {item.filePath || 'Project context'}{item.selection?.startLine ? ` · Lines ${item.selection.startLine}–${item.selection.endLine ?? item.selection.startLine}` : ''} · {item.type.replaceAll('_', ' ')} · {new Date(item.createdAt).toLocaleString()} · {item.modelName}</p></div><Button size="sm" variant="ghost" title="Remove favourite" onClick={() => void remove(item._id)}><Trash2 size={14} /></Button></div><MarkdownResponse content={item.content} />{item.projectId ? <Link href={`/workspace/projects/${item.projectId}`} className="mt-4 inline-block text-xs text-blue-400 hover:text-blue-300">Open project</Link> : <p className="mt-4 text-xs text-zinc-500">The original project was deleted; this saved snapshot remains readable.</p>}</article>)}</div>}</div>;
}
