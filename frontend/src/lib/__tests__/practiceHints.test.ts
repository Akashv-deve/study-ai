import { describe, it, expect } from 'vitest';
import { hintGate, hasEarnedSolutionOffer, runStatusLabel, evaluationStatusLabel, isRunnable } from '../practiceHints';

describe('hintGate — drives the UI from a safe hintCount, never from hint text', () => {
  it('0 hints used -> can request more, none unlocked', () => {
    const gate = hintGate({ hintCount: 3 }, { hintsUsed: 0 });
    expect(gate).toEqual({ unlocked: 0, total: 3, canRequestMore: true, allUsed: false });
  });

  it('all hints used -> cannot request more', () => {
    const gate = hintGate({ hintCount: 3 }, { hintsUsed: 3 });
    expect(gate).toEqual({ unlocked: 3, total: 3, canRequestMore: false, allUsed: true });
  });

  it('a challenge with fewer than 3 authored hints still gates correctly', () => {
    const gate = hintGate({ hintCount: 1 }, { hintsUsed: 1 });
    expect(gate.canRequestMore).toBe(false);
    expect(gate.allUsed).toBe(true);
  });

  it('never reports more unlocked than exist, even with a stale/bad hintsUsed value', () => {
    const gate = hintGate({ hintCount: 2 }, { hintsUsed: 99 });
    expect(gate.unlocked).toBe(2);
  });
});

describe('hasEarnedSolutionOffer', () => {
  it('only true once every hint has been used', () => {
    expect(hasEarnedSolutionOffer({ hintCount: 2 }, { hintsUsed: 1 })).toBe(false);
    expect(hasEarnedSolutionOffer({ hintCount: 2 }, { hintsUsed: 2 })).toBe(true);
  });
});

describe('status labels never claim a result that was not actually produced', () => {
  it('runStatusLabel makes clear a sandbox run is an observation, not a verdict', () => {
    expect(runStatusLabel(undefined)).toBe('Not run yet');
    expect(runStatusLabel({ status: 'idle', trusted: false })).toBe('Not run yet');
    expect(runStatusLabel({ status: 'passed', trusted: false })).toBe('Sandbox run completed');
    expect(runStatusLabel({ status: 'failed', trusted: false })).toBe('Sandbox run reported an issue');
    expect(runStatusLabel({ status: 'deferred', trusted: false })).toBe('Execution not available for this technology');
    expect(runStatusLabel({ status: 'error', trusted: false })).toBe('Error');
  });

  it('evaluationStatusLabel', () => {
    expect(evaluationStatusLabel(undefined)).toBe('Not checked yet');
    expect(evaluationStatusLabel({ status: 'pending' })).toBe('Not checked yet');
    expect(evaluationStatusLabel({ status: 'passed' })).toBe('Passed');
    expect(evaluationStatusLabel({ status: 'needs_work' })).toBe('Needs work');
    expect(evaluationStatusLabel({ status: 'failed' })).toBe('Failed');
  });
});

describe('isRunnable — only technologies the browser sandbox can actually execute', () => {
  it.each([['html', true], ['css', true], ['javascript', true], ['react', false], ['python', false], ['java', false], ['nodejs', false], ['express', false], ['mongodb', false]])('%s -> %s', (tech, expected) => {
    expect(isRunnable(tech as string)).toBe(expected);
  });
});
