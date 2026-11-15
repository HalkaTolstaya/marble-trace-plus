import { describe, expect, it } from 'vitest';

import { changesOfPlace } from './useRowMoveAnimation';

describe('changesOfPlace', () => {
  it('counts a pass as a gain for one row and a loss for the other', () => {
    const changes = changesOfPlace(['a', 'b', 'c'], ['b', 'a', 'c']);

    expect(changes.get('b')).toBe(1);
    expect(changes.get('a')).toBe(-1);
    expect(changes.get('c')).toBe(0);
  });

  it('does not count a car joining or leaving the list as anyone passing', () => {
    const joined = changesOfPlace(['a', 'b'], ['x', 'a', 'b']);
    const left = changesOfPlace(['x', 'a', 'b'], ['a', 'b']);

    expect([...joined.values()]).toEqual([0, 0]);
    expect([...left.values()]).toEqual([0, 0]);
  });

  it('counts several places gained in one move', () => {
    const changes = changesOfPlace(['a', 'b', 'c', 'd'], ['d', 'a', 'b', 'c']);

    expect(changes.get('d')).toBe(3);
    expect(changes.get('a')).toBe(-1);
  });
});
