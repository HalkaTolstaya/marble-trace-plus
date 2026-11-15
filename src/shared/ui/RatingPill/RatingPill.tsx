import { ChevronDown, ChevronUp } from 'lucide-react';

import { formatIr } from '@shared/ui/RatingBadge/LicBadge.utils';

import styles from './RatingPill.module.scss';

const LICENSE_CLASS: Record<string, string> = {
  P: styles.licP,
  A: styles.licA,
  B: styles.licB,
  C: styles.licC,
  D: styles.licD,
  R: styles.licR,
};

interface RatingPillProps {
  /** "A 4.99" as the sim writes it; the letter picks the colour. */
  licString: string;
  iRating: number;
  /** Projected change, or null to leave the arrow out. */
  irDelta: number | null;
  showLetter?: boolean;
  showIRating?: boolean;
  showDelta?: boolean;
  abbreviate?: boolean;
}

/**
 * The driver's ratings in one outlined pill — "A 5.8k ˄ 18": the licence class
 * in its colour, the iRating, and where the race is taking it. The outline and
 * a faint fill carry the licence colour, so the class reads at a glance.
 */
export const RatingPill = ({
  licString,
  iRating,
  irDelta,
  showLetter = true,
  showIRating = true,
  showDelta = true,
  abbreviate = true,
}: RatingPillProps) => {
  const letter = (licString || 'R').charAt(0).toUpperCase();
  const licenseClass = LICENSE_CLASS[letter] ?? styles.licR;
  const roundedDelta = irDelta === null ? null : Math.round(irDelta);

  return (
    <span className={`${styles.pill} ${licenseClass}`}>
      {showLetter && <span className={styles.letter}>{letter}</span>}
      {showIRating && (
        <span className={styles.rating}>
          {formatIr(iRating, abbreviate).toUpperCase()}
        </span>
      )}
      {showDelta && roundedDelta !== null && roundedDelta !== 0 && (
        <span className={styles.delta}>
          {roundedDelta > 0 ? (
            <ChevronUp size={10} strokeWidth={3} />
          ) : (
            <ChevronDown size={10} strokeWidth={3} />
          )}
          {Math.abs(roundedDelta)}
        </span>
      )}
    </span>
  );
};
