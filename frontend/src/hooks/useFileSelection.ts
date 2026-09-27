import { useCallback, useEffect, useRef, useState } from 'react';
import { FileContentCache } from '../lib/fileContentCache';
import { fetchApi } from '../services/api';
import { useAppStore } from '../state/store';
import { ProjectFile } from '../types';

const isAbortError = (err: unknown) => (err as { name?: string } | null)?.name === 'AbortError';

/**
 * File selection for the Code Explorer.
 *
 *  - The active file changes immediately on click; content follows when available.
 *  - Contents are cached per project, so re-opening a file makes no request.
 *  - Only the most recent click can update the view: earlier in-flight requests are aborted and,
 *    if one still resolves, ignored.
 */
export function useFileSelection(projectId: string) {
  const cacheRef = useRef(new FileContentCache());
  const controllerRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const activeRef = useRef<ProjectFile | null>(null);
  const loadingRef = useRef(false);
  const [activeFile, setActiveFileState] = useState<ProjectFile | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoadingState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setStoreFile = useAppStore((s) => s.setActiveFile);
  const setActiveSelection = useAppStore((s) => s.setActiveSelection);

  const setLoading = (value: boolean) => { loadingRef.current = value; setLoadingState(value); };

  const load = useCallback(async (file: ProjectFile) => {
    const requestId = ++requestRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    setLoading(true);
    try {
      const data = await fetchApi<{ file: ProjectFile; content: string }>(`/projects/${projectId}/files/${file._id}/content`, { signal: controller.signal });
      if (requestId !== requestRef.current) return;
      cacheRef.current.set(`${projectId}:${file._id}`, data.content);
      setContent(data.content);
      setLoading(false);
      setStoreFile(file, data.content);
    } catch (err) {
      if (requestId !== requestRef.current || isAbortError(err)) return;
      setLoading(false);
      setError(`Couldn't open ${file.path}: ${(err as Error).message}`);
    }
  }, [projectId, setStoreFile]);

  const selectFile = useCallback((file: ProjectFile) => {
    const current = activeRef.current;
    // Re-clicking the file that is already shown (or already loading) must not restart anything.
    if (current?._id === file._id && (loadingRef.current || !error)) return;
    activeRef.current = file;
    setActiveFileState(file);
    setActiveSelection(null); // the previous file's selection means nothing here
    const cached = cacheRef.current.get(`${projectId}:${file._id}`);
    if (cached !== undefined) {
      requestRef.current += 1;
      controllerRef.current?.abort();
      setError(null);
      setLoading(false);
      setContent(cached);
      setStoreFile(file, cached);
      return;
    }
    setStoreFile(file, '');
    void load(file);
  }, [error, load, projectId, setActiveSelection, setStoreFile]);

  const retryLoad = useCallback(() => {
    const file = activeRef.current;
    if (file) void load(file);
  }, [load]);

  // A different project: forget everything (including cached contents) and cancel anything in flight.
  useEffect(() => {
    cacheRef.current = new FileContentCache();
    requestRef.current += 1;
    activeRef.current = null;
    setActiveFileState(null);
    setContent('');
    setError(null);
    setLoading(false);
    setStoreFile(null);
    setActiveSelection(null);
    return () => { controllerRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return { activeFile, content, loading, error, selectFile, retryLoad };
}
