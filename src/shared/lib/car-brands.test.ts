import { describe, expect, it } from 'vitest';

import { carBrandOf } from './car-brands';

describe('carBrandOf', () => {
  it.each([
    ['Porsche 911 GT3 R (992)', 'POR'],
    ['Ferrari 296 GT3', 'FER'],
    ['BMW M4 GT3', 'BMW'],
    ['Mercedes-AMG GT3 2020', 'MB'],
    ['Aston Martin Vantage GT3 EVO', 'AM'],
    ['Chevrolet Corvette Z06 GT3.R', 'CHV'],
    ['Toyota GR86', 'TOY'],
    ['Global Mazda MX-5 Cup', 'MZD'],
    ['Dallara IR18', 'DAL'],
  ])('knows the maker of %s', (name, mark) => {
    expect(carBrandOf(name)?.mark).toBe(mark);
  });

  it('does not read a maker out of the middle of a word', () => {
    expect(carBrandOf('Formula Raycer')?.mark).toBe('FOR');
  });

  it('gives an unknown car a neutral mark of its name', () => {
    expect(carBrandOf('Zyx Prototype')?.mark).toBe('ZYX');
    expect(carBrandOf('')).toBeNull();
  });
});
