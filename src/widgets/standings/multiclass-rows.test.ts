import { describe, expect, it } from 'vitest';

import type { CarIdentity } from '@shared/contracts/car-identity';
import { multiclassRows } from './standings-utils';

const field = (size: number, playerAt: number | null): CarIdentity[] =>
  Array.from(
    { length: size },
    (_unused, index) =>
      ({ carIdx: index + 1, isPlayer: index + 1 === playerAt }) as CarIdentity
  );

const SETTINGS = { ownClassRows: 10, leaderRows: 3, otherClassRows: 3 };

const carsOf = (drivers: CarIdentity[]) =>
  drivers.map((driver) => driver.carIdx);

describe('multiclassRows', () => {
  it('keeps the leaders and three cars either side of a player further back', () => {
    const rows = multiclassRows(field(30, 20), SETTINGS);

    expect(carsOf(rows.drivers)).toEqual([1, 2, 3, 17, 18, 19, 20, 21, 22, 23]);
  });

  it('shows the plain top of the class while the player is in it', () => {
    const rows = multiclassRows(field(30, 5), SETTINGS);

    expect(carsOf(rows.drivers)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('shows only the leaders of another class', () => {
    const rows = multiclassRows(field(30, null), SETTINGS);

    expect(carsOf(rows.drivers)).toEqual([1, 2, 3]);
  });

  it('gives every row to the cars around the player with no leader rows', () => {
    const rows = multiclassRows(field(30, 20), { ...SETTINGS, leaderRows: 0 });

    expect(carsOf(rows.drivers)).toEqual([
      15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
    ]);
  });
});
