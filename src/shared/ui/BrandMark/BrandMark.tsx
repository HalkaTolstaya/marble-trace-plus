import type { CSSProperties } from 'react';

import { carBrandOf } from '@shared/lib/car-brands';
import { getContrastTextColor } from '@shared/lib/colors';

import { BRAND_LOGOS } from './brand-logos';
import styles from './BrandMark.module.scss';

/** A brand colour darker than this is drawn light: it would vanish on the table. */
const MIN_LOGO_LUMINANCE = 0.18;

/** The logo's own colour, or a light grey when that would not read on dark glass. */
const readableLogoColor = (hex: string): string => {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => ((value >> shift) & 0xff) / 255;
  const luminance =
    0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);

  return luminance < MIN_LOGO_LUMINANCE ? 'var(--brand-logo-light)' : hex;
};

/**
 * The car's maker before the driver's name: its logo in its colour where we
 * have one (`brand-logos.ts`), otherwise a short name on its colours
 * (`car-brands.ts`). Tells the cars in a pack apart at a glance.
 */
export const BrandMark = ({ carScreenName }: { carScreenName: string }) => {
  const brand = carBrandOf(carScreenName);

  if (!brand) {
    return null;
  }

  const logo = BRAND_LOGOS[brand.mark];

  if (logo) {
    return (
      <svg
        className={styles.logo}
        viewBox="0 0 24 24"
        style={{ color: readableLogoColor(logo.color) }}
      >
        <title>{carScreenName}</title>
        <path d={logo.path} fill="currentColor" />
      </svg>
    );
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
