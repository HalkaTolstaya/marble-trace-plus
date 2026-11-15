import type { ReactNode } from 'react';
import { observer } from 'mobx-react-lite';
import type { DeltaState } from '@shared/lib/delta-utils';
import styles from './DeltaPlate.module.scss';

interface Props {
  children: ReactNode;
  /** Which way the lap is going: the plate carries a wash of that colour. */
  tone: DeltaState;
  /** Extra class on the plate itself — how the caller anchors or shifts it. */
  className?: string;
}

const TONE_CLASS = {
  ahead: styles.ahead,
  behind: styles.behind,
  neutral: styles.neutral,
};

/**
 * The plate the number sits on — the background and the border the user picked,
 * painted here rather than by the container, which the manifest registers as
 * transparent. Nothing else in the widget carries a plate: the delta bar is
 * drawn straight onto the sim's own image, and a plate stretched behind it
 * would swallow the scale it draws.
 */
export const DeltaPlate = observer(
  ({ children, tone, className = '' }: Props) => (
    <div className={`${styles.plate} ${TONE_CLASS[tone]} ${className}`}>
      {children}
    </div>
  )
);
