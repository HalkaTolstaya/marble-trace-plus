import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Segmented, Slider } from 'antd';
import {
  STANDINGS_VIEW_MODE,
  type StandingsViewMode,
} from '@shared/contracts/widget-choices';
import styles from '@features/widget-settings/WidgetSettings.module.scss';
import { Card } from '@features/widget-settings/Card';
import { SettingRow } from '@features/widget-settings/SettingRow';
import { useWidgetEditor } from '@features/widget-settings/WidgetEditorContext';
import { usePanelWidgetId } from '@features/widget-settings/setting-rows';
import { schemaRows } from '@features/widget-settings/schema-rows';
import {
  BlockHint,
  BlockSubtitle,
  CheckBox,
  CheckGrid,
  RadioColumn,
  SettingsBlock,
  StepperRow,
  type CheckItem,
} from '@features/widget-settings/blocks/SettingsBlocks';
import {
  AVG_LAP_MODE,
  type AvgLapMode,
} from '@shared/contracts/widget-choices';
import {
  STANDINGS_SETTINGS,
  type StandingsWidgetSettings,
} from './settings-schema';

// Widget ids this panel configures — read by the panel registry.
export const PANEL_WIDGET_IDS = ['standings'];

const { Row, useLabels } = schemaRows(STANDINGS_SETTINGS);
const {
  nameColumnWidth,
  driversAhead,
  ownClassRows,
  leaderRows,
  otherClassRows,
  gapDecimals,
  lapTimeDecimals,
} = STANDINGS_SETTINGS.shape;

type BoolSetting = {
  [
    Key in keyof StandingsWidgetSettings
  ]: StandingsWidgetSettings[Key] extends boolean ? Key : never;
}[keyof StandingsWidgetSettings];

/** The row's parts, in the order the grid lists them. */
const ROW_LAYOUT: ReadonlyArray<{ setting: BoolSetting; label: string }> = [
  { setting: 'showCarNumber', label: 'carNumber' },
  { setting: 'showCountryFlag', label: 'countryFlag' },
  { setting: 'showLicBadge', label: 'license' },
  { setting: 'showIRating', label: 'iRating' },
  { setting: 'showIrChange', label: 'eloChange' },
  { setting: 'showGap', label: 'gap' },
  { setting: 'showInterval', label: 'interval' },
  { setting: 'showBestLap', label: 'bestLap' },
  { setting: 'showLastLap', label: 'lastLap' },
  { setting: 'showPitIndicator', label: 'pitInformation' },
  { setting: 'showTire', label: 'tyreCompound' },
  { setting: 'showStintLaps', label: 'lapsInStint' },
  { setting: 'showPosChange', label: 'positionChange' },
  { setting: 'showAvgLap', label: 'averageLap' },
  { setting: 'showDriverFlags', label: 'flags' },
  { setting: 'showColumnHeaders', label: 'columnHeaders' },
];

const PLAYER_WINDOW_OPTIONS = Array.from(
  { length: driversAhead.max - driversAhead.min + 1 },
  (_unused, offset) => {
    const count = driversAhead.min + offset;

    return { label: String(count), value: count };
  }
);

const SCROLL_RESET_OPTIONS = [0, 5, 8, 15, 30];

const NAME_COLUMN_SLIDER_WIDTH_PX = 160;

const isLapProgressShown = (settings: StandingsWidgetSettings): boolean =>
  settings.showSessionHeader && settings.showLapProgress;

export const StandingsSettingsPanel = observer(() => {
  const liveWidgets = useWidgetEditor();
  const panelWidgetId = usePanelWidgetId('standings');
  const { t } = useTranslation('widgets');
  const nameColumnLabels = useLabels('nameColumnWidth');
  const aheadLabels = useLabels('driversAhead');
  const behindLabels = useLabels('driversBehind');
  const scrollResetLabels = useLabels('scrollResetSeconds');

  const settings =
    liveWidgets.getSettings<StandingsWidgetSettings>(panelWidgetId);

  const update = (partial: Partial<StandingsWidgetSettings>) => {
    liveWidgets.updateUserSettings(panelWidgetId, {
      ...settings,
      ...partial,
    });
  };

  const rowLayoutItems: CheckItem[] = ROW_LAYOUT.map(({ setting, label }) => ({
    key: setting,
    label: t(`settingsPanels.common.layout_${label}`),
    checked: settings[setting],
  }));

  const toggleSetting = (key: string, checked: boolean) =>
    update({ [key]: checked } as Partial<StandingsWidgetSettings>);

  return (
    <>
      <Card title={t('settingsPanels.standings.layout')} defaultOpen>
        <SettingsBlock title={t('settingsPanels.standings.multiclass')}>
          <CheckBox
            label={t('settingsPanels.standings.showOtherClasses')}
            checked={settings.showOtherClasses}
            onChange={(checked) => update({ showOtherClasses: checked })}
          />
          <StepperRow
            label={t('settingsPanels.standings.ownClassRows')}
            value={settings.ownClassRows}
            min={ownClassRows.min}
            max={ownClassRows.max}
            onChange={(value) => update({ ownClassRows: value })}
          />
          <StepperRow
            label={t('settingsPanels.standings.leaderRows')}
            value={settings.leaderRows}
            min={leaderRows.min}
            max={leaderRows.max}
            onChange={(value) => update({ leaderRows: value })}
          />
          <BlockHint>{t('settingsPanels.standings.leaderRowsDesc')}</BlockHint>
          <StepperRow
            label={t('settingsPanels.standings.otherClassRows')}
            value={settings.otherClassRows}
            min={otherClassRows.min}
            max={otherClassRows.max}
            onChange={(value) => update({ otherClassRows: value })}
          />
          {settings.viewMode !== 'grouped' && (
            <BlockHint>
              {t('settingsPanels.standings.multiclassViewHint')}
            </BlockHint>
          )}
        </SettingsBlock>

        <SettingsBlock title={t('settingsPanels.common.timing')}>
          <StepperRow
            label={t('settingsPanels.standings.gapDecimals')}
            value={settings.gapDecimals}
            min={gapDecimals.min}
            max={gapDecimals.max}
            onChange={(value) => update({ gapDecimals: value })}
          />
          <StepperRow
            label={t('settingsPanels.standings.lapTimeDecimals')}
            value={settings.lapTimeDecimals}
            min={lapTimeDecimals.min}
            max={lapTimeDecimals.max}
            onChange={(value) => update({ lapTimeDecimals: value })}
          />
        </SettingsBlock>

        <SettingsBlock title={t('settingsPanels.common.headerLayout')}>
          <CheckGrid
            columns={2}
            items={[
              {
                key: 'showWeather',
                label: t('settingsPanels.common.layout_weather'),
                checked: settings.showWeather,
              },
              {
                key: 'showSessionHeader',
                label: t('settingsPanels.common.layout_raceInformation'),
                checked: settings.showSessionHeader,
              },
            ]}
            onToggle={toggleSetting}
          />
        </SettingsBlock>

        <SettingsBlock title={t('settingsPanels.common.rowLayout')}>
          <CheckGrid items={rowLayoutItems} onToggle={toggleSetting} />

          <BlockSubtitle>
            {t('settingsPanels.common.layout_averageLap')}
          </BlockSubtitle>
          <RadioColumn<AvgLapMode>
            name="standings-avg-lap"
            value={settings.avgLapMode}
            options={AVG_LAP_MODE.map((mode) => ({
              value: mode,
              label: t(`settingsPanels.common.avgLapMode_${mode}`),
            }))}
            onChange={(value) => update({ avgLapMode: value })}
          />
          <BlockHint>{t('settingsPanels.common.avgLapModeDesc')}</BlockHint>
        </SettingsBlock>
      </Card>

      <Card title={t('settingsPanels.standings.appearance')}>
        <div className={styles.fieldGroup}>
          <Row setting="rowPadding" />
        </div>

        <div className={styles.fieldGroup}>
          <SettingRow
            title={nameColumnLabels.title}
            desc={nameColumnLabels.desc}
          >
            <Slider
              style={{ width: NAME_COLUMN_SLIDER_WIDTH_PX }}
              min={nameColumnWidth.min}
              max={nameColumnWidth.max}
              step={nameColumnWidth.step}
              value={settings.nameColumnWidth}
              tooltip={{ formatter: (value) => `${value ?? 0} px` }}
              onChange={(value) => update({ nameColumnWidth: value })}
            />
          </SettingRow>
        </div>

        <div className={styles.fieldGroup}>
          <Row setting="dimSecondaryColumns" />
        </div>

        <div className={styles.fieldGroup}>
          <Row setting="playerRowColor" />
        </div>

        <div className={styles.fieldGroup}>
          <Row setting="playerAccentColor" />
        </div>
      </Card>

      <Card title={t('settingsPanels.common.positions')}>
        <div className={styles.fieldGroup}>
          <Row setting="useLivePositions" />
        </div>
      </Card>

      <Card title={t('settingsPanels.standings.viewMode')}>
        <div className={styles.fieldGroup}>
          <Segmented<StandingsViewMode>
            block
            value={settings.viewMode}
            onChange={(value) => update({ viewMode: value })}
            options={STANDINGS_VIEW_MODE.map((mode) => ({
              label: t(`settingsPanels.standings.viewMode_${mode}`),
              value: mode,
            }))}
          />
        </div>

        {/*
          The window around the player of the single-list views; the grouped
          view sizes it from the multiclass rows above.
        */}
        <div className={styles.fieldGroup}>
          <SettingRow title={aheadLabels.title} desc={aheadLabels.desc}>
            <Segmented<number>
              value={settings.driversAhead}
              onChange={(value) => update({ driversAhead: value })}
              options={PLAYER_WINDOW_OPTIONS}
            />
          </SettingRow>
        </div>

        <div className={styles.fieldGroup}>
          <SettingRow title={behindLabels.title} desc={behindLabels.desc}>
            <Segmented<number>
              value={settings.driversBehind}
              onChange={(value) => update({ driversBehind: value })}
              options={PLAYER_WINDOW_OPTIONS}
            />
          </SettingRow>
        </div>
      </Card>

      <Card title={t('settingsPanels.standings.scrolling')}>
        <div className={styles.fieldGroup}>
          <SettingRow
            title={scrollResetLabels.title}
            desc={scrollResetLabels.desc}
          >
            <Segmented<number>
              value={settings.scrollResetSeconds}
              onChange={(value) => update({ scrollResetSeconds: value })}
              options={SCROLL_RESET_OPTIONS.map((seconds) => ({
                label:
                  seconds === 0
                    ? t('settingsPanels.standings.scrollResetOff')
                    : `${seconds}s`,
                value: seconds,
              }))}
            />
          </SettingRow>
        </div>
      </Card>

      <Card title={t('settingsPanels.common.dataColumns')}>
        <Row setting="showLivePosChange" />
        <Row setting="showBrand" />
        <Row setting="licBadgeStyle" dependsOn="showLicBadge" />
        <Row setting="showLicenseLetter" dependsOn="showLicBadge" />
        <Row setting="abbreviateIRating" dependsOn="showIRating" />
        <Row setting="showRadioMark" />
        <Row setting="showLapsCompleted" />
        <Row setting="abbreviateNames" />
        <Row setting="hideRetiredDrivers" />
        <Row setting="hideDriversWithoutLap" />
      </Card>

      <Card title={t('settingsPanels.standings.headerInfo')}>
        <Row setting="showSessionTime" dependsOn="showSessionHeader" />
        <Row setting="showLapProgress" dependsOn="showSessionHeader" />
        <Row setting="lapCounter" dependsOn={isLapProgressShown} />
        <Row setting="showSOF" />
        <Row setting="abbreviateSof" dependsOn="showSOF" />
        <Row setting="showTotalDrivers" />
      </Card>

      <Card title={t('settingsPanels.standings.footerInfo')}>
        <Row setting="showPitStops" />
        <Row setting="showIncidentsBadge" />
      </Card>
    </>
  );
});
