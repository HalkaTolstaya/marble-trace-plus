import type { CSSProperties } from 'react';

import { carBrandOf } from '@shared/lib/car-brands';
import { getContrastTextColor } from '@shared/lib/colors';

import styles from './BrandMark.module.scss';

/**
 * The car's maker as a small plate before the driver's name: a short name on
 * the maker's colours (our own drawing, see `car-brands.ts`). Tells the cars
 * in a pack apart at a glance.
 */
export const BrandMark = ({ carScreenName }: { carScreenName: string }) => {
  const brand = carBrandOf(carScreenName);

  if (!brand) {
    return null;
  }

  const style = {
    '--brand-color': brand.color,
    '--brand-accent': brand.accent ?? brand.color,
    color: getContrastTextColor(brand.color),
  } as CSSProperties;

  return (
    <span className={styles.mark} style={style} title={carScreenName}>
      {brand.mark}
    </span>
  );
};
