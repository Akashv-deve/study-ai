import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchApi } from '../services/api';
import { Project } from '../types';
import { useAppStore } from '../state/store';

export type ProjectLoadErrorKind = 'not-found' | 'unauthorized' | 'unavailable';

export interface ProjectLoadError {
  kind: ProjectLoadErrorKind;
  message: string;
}

/**
 * The backend answers 404 for a project that is missing *and* for one that belongs to
 * another user (see projectRepository.findOwnedById), so both surface as "not-found"
 * without revealing which one it was.
 */
export function toProjectLoadError(err: unknown): ProjectLoadError {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return { kind: 'unauthorized', message: 'Your session has expired. Sign in again to continue.' };
    }
    if (err.status === 400 || err.status === 403 || err.status === 404) {
      return { kind: 'not-found', message: "This project doesn't exist, was deleted, or belongs to a different account." };
    }
    if (err.status >= 500) {
      return { kind: 'unavailable', message: `The server is unavailable right now (${err.message}). Try again in a few seconds.` };
    }
    return { kind: 'unavailable', message: err.message };
  }
  return { kind: 'unavailable', message: 'Could not reach the server. Check your connection and try again.' };
}

interface ProjectState {
  project: Project | null;
  error: ProjectLoadError | null;
  loading: boolean;
}

/**
 * Loads GET /api/projects/:id for the given id and keeps the Zustand `currentProject`
 * in sync so the sidebar's project navigation works on a hard refresh or deep link.
 *
 * - `reload()` shows the loading state again (initial load / "Try again").
 * - `refresh()` re-fetches quietly in the background (used while a project is processing).
 */
export function useProject(id: string) {
  const [state, setState] = useState<ProjectState>({ project: null, error: null, loading: true });
  const setCurrentProject = useAppStore((s) => s.setCurrentProject);
  const latestRequest = useRef(0);

  const load = useCallback(async (background: boolean) => {
    const requestId = ++latestRequest.current;
    if (!background) {
      setState({ project: null, error: null, loading: true });
      const current = useAppStore.getState().currentProject;
      if (current && current._id !== id) setCurrentProject(null);
    }
    try {
      const project = await fetchApi<Project>(`/projects/${id}`);
      if (requestId !== latestRequest.current) return;
      setState({ project, error: null, loading: false });
      setCurrentProject(project);
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      const error = toProjectLoadError(err);
      // A transient failure during a background refresh should not blow away a page that is already showing.
      if (background && error.kind === 'unavailable') return;
      if (error.kind !== 'unavailable') setCurrentProject(null);
      setState({ project: null, error, loading: false });
    }
  }, [id, setCurrentProject]);

  useEffect(() => {
    void load(false);
    // Invalidate in-flight requests when the id changes or the page unmounts.
    return () => { latestRequest.current += 1; };
  }, [load]);

  const reload = useCallback(() => load(false), [load]);
  const refresh = useCallback(() => load(true), [load]);

  return { ...state, reload, refresh };
}
