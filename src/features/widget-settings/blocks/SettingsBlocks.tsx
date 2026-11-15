import type { ReactNode } from 'react';
import { observer } from 'mobx-react-lite';
import { Check, Minus, Plus } from 'lucide-react';

import styles from './SettingsBlocks.module.scss';

/**
 * The compact building blocks of a widget's settings: titled sections split by
 * hairlines, a grid of checkboxes for the parts of a layout, a − N + stepper
 * for a count, and a column of radio choices. A panel stays one page instead
 * of a stack of folded cards.
 */

interface BlockProps {
  title: string;
  children: ReactNode;
}

export const SettingsBlock = ({ title, children }: BlockProps) => (
  <section className={styles.block}>
    <h4 className={styles.blockTitle}>{title}</h4>
    {children}
  </section>
);

export interface CheckItem {
  key: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
}

interface CheckGridProps {
  items: readonly CheckItem[];
  onToggle: (key: string, checked: boolean) => void;
  /** Columns at full width; fewer on a narrow panel. */
  columns?: 2 | 3 | 4;
}

export const CheckGrid = observer(
  ({ items, onToggle, columns = 4 }: CheckGridProps) => (
    <div className={`${styles.checkGrid} ${styles[`columns${columns}`]}`}>
      {items.map((item) => (
        <CheckBox
          key={item.key}
          label={item.label}
          checked={item.checked}
          disabled={item.disabled}
          onChange={(checked) => onToggle(item.key, checked)}
        />
      ))}
    </div>
  )
);

interface CheckBoxProps {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export const CheckBox = ({
  label,
  checked,
  disabled = false,
  onChange,
}: CheckBoxProps) => (
  <label
    className={`${styles.check} ${checked ? styles.checkOn : ''} ${disabled ? styles.checkDisabled : ''}`}
  >
    <input
      type="checkbox"
      className={styles.checkInput}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span className={styles.checkBox} aria-hidden>
      {checked && <Check size={13} strokeWidth={3.2} />}
    </span>
    <span className={styles.checkLabel}>{label}</span>
  </label>
);

interface StepperRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

export const StepperRow = ({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: StepperRowProps) => {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  return (
    <div className={styles.stepperRow}>
      <span className={styles.stepperLabel}>{label}</span>
      <div className={styles.stepper}>
        <button
          type="button"
          className={styles.stepperButton}
          disabled={value <= min}
          aria-label={`${label} −`}
          onClick={() => onChange(clamp(value - step))}
        >
          <Minus size={14} />
        </button>
        <span className={styles.stepperValue}>{value}</span>
        <button
          type="button"
          className={styles.stepperButton}
          disabled={value >= max}
          aria-label={`${label} +`}
          onClick={() => onChange(clamp(value + step))}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
};

interface RadioOption<Value extends string> {
  value: Value;
  label: string;
}

interface RadioColumnProps<Value extends string> {
  name: string;
  value: Value;
  options: readonly RadioOption<Value>[];
  onChange: (value: Value) => void;
  /** Side by side rather than one under the other. */
  inline?: boolean;
}

export const RadioColumn = <Value extends string>({
  name,
  value,
  options,
  onChange,
  inline = false,
}: RadioColumnProps<Value>) => (
  <div className={inline ? styles.radioInline : styles.radioColumn}>
    {options.map((option) => (
      <label
        key={option.value}
        className={`${styles.radio} ${option.value === value ? styles.radioOn : ''}`}
      >
        <input
          type="radio"
          className={styles.checkInput}
          name={name}
          checked={option.value === value}
          onChange={() => onChange(option.value)}
        />
        <span className={styles.radioDot} aria-hidden />
        <span className={styles.checkLabel}>{option.label}</span>
      </label>
    ))}
  </div>
);

export const BlockHint = ({ children }: { children: ReactNode }) => (
  <p className={styles.hint}>{children}</p>
);

export const BlockSubtitle = ({ children }: { children: ReactNode }) => (
  <h5 className={styles.subtitle}>{children}</h5>
);
