import { describe, it, expect } from 'vitest';
import { solutionToFiles } from '../SolutionViewer';

describe('solutionToFiles — Task 3: the reveal is always renderable as code, never plain paragraph text', () => {
  it('a multi-file solution is passed through as-is, with the prose explanation kept separate', () => {
    const files = [{ path: 'App.jsx', content: 'export default function App() {}' }, { path: 'styles.css', content: '.a{}' }];
    const result = solutionToFiles('react', 'This uses a controlled component.', files);
    expect(result.files).toEqual(files);
    expect(result.explanation).toBe('This uses a controlled component.');
  });

  it('a challenge with NO stored files still renders as ONE code file (never a bare paragraph)', () => {
    const result = solutionToFiles('python', 'def solve(n):\n    return n * 2', []);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('solution.py');
    expect(result.files[0].content).toBe('def solve(n):\n    return n * 2');
    expect(result.explanation).toBeNull(); // the "solution" text IS the code in this case, not duplicated as prose too
  });

  it('picks the right fallback extension per technology when there are no files', () => {
    expect(solutionToFiles('java', 'public class Main {}', []).files[0].path).toBe('solution.java');
    expect(solutionToFiles('html', '<div></div>', []).files[0].path).toBe('solution.html');
  });

  it('an empty explanation string is treated as no explanation', () => {
    const result = solutionToFiles('javascript', '   ', [{ path: 'a.js', content: 'x' }]);
    expect(result.explanation).toBeNull();
  });
});
