import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchApi, ApiError } from '../services/api';
import { ChallengeFile, PracticeAttempt, PracticeChallenge, RunResult } from '../types';
import { runInSandbox } from '../lib/sandboxRunner';
import { isRunnable } from '../lib/practiceHints';

const AUTOSAVE_DEBOUNCE_MS = 1200;
const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

export interface UsePracticeAttemptState {
  attempt: PracticeAttempt | null;
  loading: boolean;
  error: string | null; // fatal load error — nothing usable is on screen
  actionError: string | null; // a run/check/hint/reveal/explain/save/reset action failed — attempt is still usable
  saving: boolean;
  running: boolean;
  checking: boolean;
  requestingHint: boolean;
  revealing: boolean;
  explaining: boolean;
  resetting: boolean;
  explanation: string | null;
  lastHint: { hint: string; hintLevel: number } | null;
  solution: { referenceSolution: string; referenceSolutionFiles: ChallengeFile[] } | null;
}

export function usePracticeAttempt(challengeId: string, projectId: string | undefined) {
  const [challenge, setChallenge] = useState<PracticeChallenge | null>(null);
  const [state, setState] = useState<UsePracticeAttemptState>({
    attempt: null, loading: true, error: null, actionError: null, saving: false, running: false, checking: false,
    requestingHint: false, revealing: false, explaining: false, resetting: false, explanation: null, lastHint: null, solution: null,
  });

  // --- refs used purely for coordinating async work; never touched from inside a setState updater (Issue #2) ---
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelRun = useRef<(() => void) | null>(null);
  // Bumped whenever a save is superseded (a newer edit, or a reset) — a save's own response is only applied
  // if no newer save/reset has happened since it was issued (Issue #16 / Small #3).
  const saveSeq = useRef(0);
  const pendingSave = useRef<{ seq: number; promise: Promise<void> } | null>(null);
  // The attempt id every in-flight action was launched against. A completion is only applied if this still
  // matches the CURRENT attempt when it resolves — this is what stops a response for the old attempt from
  // mutating state after Reset has already swapped in a new one (Small #28).
  const currentAttemptId = useRef<string | null>(null);
  useEffect(() => { currentAttemptId.current = state.attempt?._id ?? null; }, [state.attempt?._id]);
  const isStale = (forAttemptId: string) => currentAttemptId.current !== forAttemptId;
  // Simple in-flight guards so a rapid double-click can't fire the same action twice even before React
  // re-renders the disabled button (Small #29 — belt and suspenders; the server is the real guarantee).
  const inFlight = useRef<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
      const [challengeData, attemptData] = await Promise.all([
        fetchApi<PracticeChallenge>(`/practice/challenges/${challengeId}${qs}`),
        fetchApi<PracticeAttempt>(`/practice/challenges/${challengeId}/attempt${qs}`),
      ]);
      setChallenge(challengeData);
      setState((s) => ({ ...s, attempt: attemptData, loading: false }));
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: message(err, 'Could not load this challenge.') }));
    }
  }, [challengeId, projectId]);

  useEffect(() => { void load(); return () => { if (saveTimer.current) clearTimeout(saveTimer.current); cancelRun.current?.(); }; }, [load]);

  /** Performs the actual PATCH for whatever files are given, for a specific attempt id. Pure network call —
   * never invoked from inside a setState updater. Resolves once applied (or dropped as stale). */
  const doSave = useCallback((attemptId: string, files: ChallengeFile[]): Promise<void> => {
    const mySeq = ++saveSeq.current;
    setState((s) => ({ ...s, saving: true }));
    const promise = fetchApi<PracticeAttempt>(`/practice/attempts/${attemptId}`, { method: 'PATCH', body: JSON.stringify({ files }) })
      .then((saved) => {
        if (mySeq !== saveSeq.current || isStale(attemptId)) return; // superseded by a newer edit or a reset — drop it
        // Merge everything EXCEPT files: the editor's local files are already the most current thing the
        // user has typed, and re-applying the server's echo of what we just sent can never help.
        const { files: _serverFiles, ...rest } = saved;
        setState((s2) => (s2.attempt ? { ...s2, saving: false, attempt: { ...s2.attempt, ...rest } } : s2));
      })
      .catch((err) => {
        if (mySeq !== saveSeq.current || isStale(attemptId)) return;
        setState((s2) => ({ ...s2, saving: false, actionError: message(err, 'Could not save your changes. They are kept locally — try again.') }));
      })
      .finally(() => { if (pendingSave.current?.seq === mySeq) pendingSave.current = null; });
    pendingSave.current = { seq: mySeq, promise };
    return promise;
  }, []);

  /** Updates the editor content immediately and debounces the PATCH so every keystroke doesn't hit the network. */
  const updateFile = useCallback((path: string, content: string) => {
    const attemptId = currentAttemptId.current;
    setState((s) => {
      if (!s.attempt) return s;
      const files = s.attempt.files.map((f) => (f.path === path ? { ...f, content } : f));
      return { ...s, attempt: { ...s.attempt, files } };
    });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // Read the latest files at fire-time via a functional get rather than closing over stale state —
      // setState's updater here is pure (no side effect), it only READS state to hand off to doSave().
      setState((s) => {
        if (s.attempt && attemptId) void doSave(attemptId, s.attempt.files);
        return s;
      });
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [doSave]);

  /** Flushes any pending/in-flight autosave and waits for it, so the next action reads the LATEST code
   * (Small #1). If nothing is pending or in flight, resolves immediately. */
  const flushPendingSave = useCallback(async (attemptId: string, files: ChallengeFile[]): Promise<void> => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = undefined; await doSave(attemptId, files); return; }
    if (pendingSave.current) { await pendingSave.current.promise; return; }
  }, [doSave]);

  const run = useCallback(() => {
    if (!state.attempt || !challenge) return;
    const attemptId = state.attempt._id;
    if (inFlight.current.run) return;
    inFlight.current.run = true;
    cancelRun.current?.();
    setState((s) => ({ ...s, running: true, actionError: null }));
    const settle = () => { inFlight.current.run = false; };
    const onDone = (attempt: PracticeAttempt) => { settle(); if (!isStale(attemptId)) setState((s) => ({ ...s, attempt, running: false })); };
    const onFail = (err: unknown) => { settle(); if (!isStale(attemptId)) setState((s) => ({ ...s, running: false, actionError: message(err, 'Could not run your code. Check your connection and try again.') })); };
    if (isRunnable(challenge.technology)) {
      const handle = runInSandbox(state.attempt.files, (result: RunResult) => {
        fetchApi<PracticeAttempt>(`/practice/attempts/${attemptId}/run`, { method: 'POST', body: JSON.stringify(result) }).then(onDone).catch(onFail);
      });
      cancelRun.current = handle.cancel;
    } else {
      fetchApi<PracticeAttempt>(`/practice/attempts/${attemptId}/run`, { method: 'POST', body: JSON.stringify({}) }).then(onDone).catch(onFail);
    }
  }, [state.attempt, challenge]);

  const check = useCallback(async () => {
    if (!state.attempt || inFlight.current.check) return;
    const attemptId = state.attempt._id;
    inFlight.current.check = true;
    setState((s) => ({ ...s, checking: true, actionError: null }));
    try {
      await flushPendingSave(attemptId, state.attempt.files); // Small #1: never check against stale persisted code
      if (isStale(attemptId)) return;
      const attempt = await fetchApi<PracticeAttempt>(`/practice/attempts/${attemptId}/check`, { method: 'POST' });
      if (!isStale(attemptId)) setState((s) => ({ ...s, attempt, checking: false }));
    } catch (err) {
      if (!isStale(attemptId)) setState((s) => ({ ...s, checking: false, actionError: message(err, 'Could not check your solution. Try again in a moment.') }));
    } finally {
      inFlight.current.check = false;
      if (isStale(attemptId)) setState((s) => ({ ...s, checking: false }));
    }
  }, [state.attempt, flushPendingSave]);

  const requestHint = useCallback(async () => {
    if (!state.attempt || inFlight.current.hint) return;
    const attemptId = state.attempt._id;
    inFlight.current.hint = true;
    setState((s) => ({ ...s, requestingHint: true, actionError: null }));
    try {
      const result = await fetchApi<{ hint: string; hintLevel: number }>(`/practice/attempts/${attemptId}/hint`, { method: 'POST' });
      if (!isStale(attemptId)) setState((s) => (s.attempt ? { ...s, requestingHint: false, lastHint: result, attempt: { ...s.attempt, hintsUsed: result.hintLevel } } : s));
    } catch (err) {
      if (!isStale(attemptId)) setState((s) => ({ ...s, requestingHint: false, actionError: message(err, 'Could not get a hint right now.') }));
    } finally {
      inFlight.current.hint = false;
    }
  }, [state.attempt]);

  const revealSolution = useCallback(async () => {
    if (!state.attempt || inFlight.current.reveal) return;
    const attemptId = state.attempt._id;
    inFlight.current.reveal = true;
    setState((s) => ({ ...s, revealing: true, actionError: null }));
    try {
      const result = await fetchApi<{ referenceSolution: string; referenceSolutionFiles: ChallengeFile[] }>(`/practice/attempts/${attemptId}/reveal`, { method: 'POST' });
      if (!isStale(attemptId)) setState((s) => (s.attempt ? { ...s, revealing: false, solution: result, attempt: { ...s.attempt, solutionRevealed: true } } : s));
    } catch (err) {
      if (!isStale(attemptId)) setState((s) => ({ ...s, revealing: false, actionError: message(err, 'Could not reveal the solution.') }));
    } finally {
      inFlight.current.reveal = false;
    }
  }, [state.attempt]);

  const explainMistake = useCallback(async () => {
    if (!state.attempt || inFlight.current.explain) return;
    const attemptId = state.attempt._id;
    inFlight.current.explain = true;
    setState((s) => ({ ...s, explaining: true, actionError: null }));
    try {
      await flushPendingSave(attemptId, state.attempt.files); // Small #1: explain the LATEST code, not stale persisted code
      if (isStale(attemptId)) return;
      const result = await fetchApi<{ explanation: string }>(`/practice/attempts/${attemptId}/explain-mistake`, { method: 'POST' });
      if (!isStale(attemptId)) setState((s) => ({ ...s, explaining: false, explanation: result.explanation }));
    } catch (err) {
      if (!isStale(attemptId)) setState((s) => ({ ...s, explaining: false, actionError: message(err, 'Could not generate an explanation right now.') }));
    } finally {
      inFlight.current.explain = false;
      if (isStale(attemptId)) setState((s) => ({ ...s, explaining: false }));
    }
  }, [state.attempt, flushPendingSave]);

  const reset = useCallback(async () => {
    if (!state.attempt || inFlight.current.reset) return;
    const oldAttemptId = state.attempt._id;
    inFlight.current.reset = true;
    // Small #3: cancel any pending autosave timer and invalidate any in-flight save's response BEFORE
    // touching the network, so nothing from the old attempt can land after the new one is active.
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = undefined; }
    saveSeq.current += 1;
    pendingSave.current = null;
    setState((s) => ({ ...s, resetting: true, actionError: null, saving: false }));
    try {
      const attempt = await fetchApi<PracticeAttempt>(`/practice/attempts/${oldAttemptId}/reset`, { method: 'POST' });
      // Explicitly clear every action-loading flag: any of them still true here belongs to an in-flight
      // action against the OLD attempt whose own completion will now be dropped as stale (isStale guards
      // above) and will never flip its flag back off itself.
      setState((s) => ({ ...s, attempt, resetting: false, running: false, checking: false, requestingHint: false, revealing: false, explaining: false, lastHint: null, solution: null, explanation: null }));
    } catch (err) {
      // Only report the failure if we're still looking at the attempt that failed to reset.
      if (!isStale(oldAttemptId)) setState((s) => ({ ...s, resetting: false, actionError: message(err, 'Could not start a new attempt.') }));
    } finally {
      inFlight.current.reset = false;
    }
  }, [state.attempt]);

  return { challenge, ...state, updateFile, run, check, requestHint, revealSolution, explainMistake, reset, reload: load };
}
