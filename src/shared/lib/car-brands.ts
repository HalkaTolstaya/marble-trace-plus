/**
 * The maker of a car, from the name the sim gives it, as a small mark the
 * tables draw before the driver: a short name on the maker's colours. Our own
 * drawing — not the makers' logos, which are their trademarks — so a glance
 * still tells a Porsche from a BMW in the pack.
 */
export interface CarBrand {
  /** Shown on the mark, two to four letters. */
  mark: string;
  /** The mark's ground. */
  color: string;
  /** A second colour along its lower edge, when the maker's livery has one. */
  accent?: string;
}

interface BrandRule extends CarBrand {
  /** Words that name the maker in iRacing's car names (lower case). */
  keys: readonly string[];
}

// Most specific first: "mercedes-amg" before "mercedes", "aston" before "martin".
const BRAND_RULES: readonly BrandRule[] = [
  { keys: ['porsche'], mark: 'POR', color: '#1d1d1f', accent: '#c8a75c' },
  { keys: ['ferrari'], mark: 'FER', color: '#c8102e', accent: '#ffd400' },
  { keys: ['bmw'], mark: 'BMW', color: '#0b4ea2', accent: '#7fb5e8' },
  {
    keys: ['mercedes', 'amg'],
    mark: 'MB',
    color: '#5b6066',
    accent: '#c9ced3',
  },
  { keys: ['audi'], mark: 'AUDI', color: '#2b2b2b', accent: '#bb0a30' },
  { keys: ['lamborghini'], mark: 'LAM', color: '#1c1c1c', accent: '#d4a933' },
  { keys: ['mclaren'], mark: 'McL', color: '#ff7a00', accent: '#1d1d1f' },
  { keys: ['aston'], mark: 'AM', color: '#00594f', accent: '#cdd5d2' },
  {
    keys: ['corvette', 'chevrolet', 'chevy', 'camaro'],
    mark: 'CHV',
    color: '#1f1f1f',
    accent: '#d1a33c',
  },
  { keys: ['cadillac'], mark: 'CAD', color: '#20232a', accent: '#b4975a' },
  {
    keys: ['ford', 'mustang'],
    mark: 'FRD',
    color: '#123a7a',
    accent: '#9fb7dd',
  },
  {
    keys: ['toyota', 'gr86', 'supra'],
    mark: 'TOY',
    color: '#d01e2a',
    accent: '#f2f2f2',
  },
  { keys: ['lexus'], mark: 'LEX', color: '#2a2d33', accent: '#c7c9cc' },
  { keys: ['acura'], mark: 'ACU', color: '#b0141d', accent: '#dcdcdc' },
  {
    keys: ['honda', 'civic'],
    mark: 'HON',
    color: '#cc0000',
    accent: '#f2f2f2',
  },
  {
    keys: ['mazda', 'mx-5', 'mx5'],
    mark: 'MZD',
    color: '#6d0f1c',
    accent: '#c9c9c9',
  },
  { keys: ['nissan'], mark: 'NIS', color: '#3b3b3b', accent: '#c3002f' },
  { keys: ['hyundai'], mark: 'HYU', color: '#002c5f', accent: '#a3b9d4' },
  { keys: ['kia'], mark: 'KIA', color: '#05141f', accent: '#bc1f2c' },
  { keys: ['subaru'], mark: 'SUB', color: '#0b2c74', accent: '#6c8fd6' },
  {
    keys: ['volkswagen', 'vw'],
    mark: 'VW',
    color: '#001e50',
    accent: '#7ea6d8',
  },
  { keys: ['renault'], mark: 'REN', color: '#f5c400', accent: '#1d1d1f' },
  { keys: ['alpine'], mark: 'ALP', color: '#0058a3', accent: '#e4002b' },
  { keys: ['peugeot'], mark: 'PEU', color: '#1b1f2a', accent: '#c4c8d0' },
  { keys: ['lotus'], mark: 'LOT', color: '#004225', accent: '#ffd100' },
  { keys: ['ligier'], mark: 'LIG', color: '#0d2a5c', accent: '#d9dee8' },
  {
    keys: ['dallara', 'indycar', 'super formula', 'f3', 'formula vee'],
    mark: 'DAL',
    color: '#1c2a3a',
    accent: '#e33b32',
  },
  { keys: ['radical'], mark: 'RAD', color: '#e8a400', accent: '#1d1d1f' },
  { keys: ['williams'], mark: 'WIL', color: '#00337f', accent: '#00a3e0' },
  { keys: ['holden'], mark: 'HOL', color: '#a30d1c', accent: '#f2f2f2' },
  {
    keys: ['ray', 'skip barber', 'spec racer'],
    mark: 'SPC',
    color: '#2f3640',
    accent: '#9aa3ad',
  },
];

const OTHER_COLOR = '#3a3f47';
const OTHER_ACCENT = '#9aa3ad';
const OTHER_MARK_LENGTH = 3;

/** The car's maker, or a neutral mark of the name's first letters. */
export const carBrandOf = (carScreenName: string): CarBrand | null => {
  const name = carScreenName.trim().toLowerCase();

  if (!name) {
    return null;
  }

  const rule = BRAND_RULES.find((candidate) =>
    candidate.keys.some((key) =>
      new RegExp(`(^|[^a-z])${key}([^a-z]|$)`).test(name)
    )
  );

  if (rule) {
    return { mark: rule.mark, color: rule.color, accent: rule.accent };
  }

  return {
    mark: carScreenName.trim().slice(0, OTHER_MARK_LENGTH).toUpperCase(),
    color: OTHER_COLOR,
    accent: OTHER_ACCENT,
  };
};
