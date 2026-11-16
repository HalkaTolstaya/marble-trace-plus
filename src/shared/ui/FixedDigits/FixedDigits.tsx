import { observer } from 'mobx-react-lite';

import styles from './FixedDigits.module.scss';

interface FixedDigitsProps {
  /** Any text; its digits keep one width whatever they are. */
  text: string;
  className?: string;
}

/**
 * Text whose digits all take the same width, so a clock or a lap count does
 * not shuffle sideways as its digits change. The widgets' typeface (Manrope)
 * carries tabular figures, so the font does it; spaces are kept as written.
 */
export const FixedDigits = observer(({ text, className }: FixedDigitsProps) => (
  <span className={`${styles.root} ${className ?? ''}`}>{text}</span>
));
