import { useWidgetSettings } from '@entities/layout/useWidgetSettings';
import { observer } from 'mobx-react-lite';

import { buildGridTemplate } from '@widgets/standings/standings-utils';
import { StandingsHeaderCell } from './StandingsHeaderCell';

import styles from './StandingsHeader.module.scss';
import type { StandingsWidgetSettings } from '../settings-schema';

export const StandingsHeader = observer(() => {
  const settings = useWidgetSettings<StandingsWidgetSettings>('standings');

  if (!settings.showColumnHeaders) {
    return null;
  }

  const gridTemplate = buildGridTemplate(settings);

  return (
    <div
      className={styles.headerRow}
      style={{ gridTemplateColumns: gridTemplate }}
    >
      <StandingsHeaderCell>Pos</StandingsHeaderCell>

      {settings.showPosChange && (
        <StandingsHeaderCell align="center">±</StandingsHeaderCell>
      )}

      {settings.showCarNumber && (
        <StandingsHeaderCell align="center">#</StandingsHeaderCell>
      )}

      {settings.showCountryFlag && <StandingsHeaderCell> </StandingsHeaderCell>}

      <StandingsHeaderCell>Driver</StandingsHeaderCell>

      {settings.showLicBadge && (
        <StandingsHeaderCell align="center">SR</StandingsHeaderCell>
      )}

      {settings.showIRating && (
        <StandingsHeaderCell align="center">iR</StandingsHeaderCell>
      )}

      {settings.showIrChange && (
        <StandingsHeaderCell
          align="center"
          title="Projected iR change (Elo estimate, not real iRacing data)"
        >
          ±iR
        </StandingsHeaderCell>
      )}

      {settings.showLapsCompleted && (
        <StandingsHeaderCell align="center">Laps</StandingsHeaderCell>
      )}

      {settings.showGap && (
        <StandingsHeaderCell align="right">Gap</StandingsHeaderCell>
      )}

      {settings.showInterval && (
        <StandingsHeaderCell align="right">Int</StandingsHeaderCell>
      )}

      {settings.showBestLap && (
        <StandingsHeaderCell align="right">Best</StandingsHeaderCell>
      )}

      {settings.showLastLap && (
        <StandingsHeaderCell align="right">Last</StandingsHeaderCell>
      )}

      {settings.showAvgLap && (
        <StandingsHeaderCell align="right">Avg</StandingsHeaderCell>
      )}

      {settings.showStintLaps && (
        <StandingsHeaderCell align="center">Stint</StandingsHeaderCell>
      )}

      {settings.showBrand && (
        <StandingsHeaderCell align="center">Brand</StandingsHeaderCell>
      )}

      {settings.showTire && (
        <StandingsHeaderCell align="center">Tire</StandingsHeaderCell>
      )}
    </div>
  );
});
