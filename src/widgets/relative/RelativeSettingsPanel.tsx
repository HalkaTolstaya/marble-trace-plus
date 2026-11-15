import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Slider } from 'antd';
import styles from '@features/widget-settings/WidgetSettings.module.scss';
import { Card } from '@features/widget-settings/Card';
import { SettingRow } from '@features/widget-settings/SettingRow';
import { useWidgetEditor } from '@features/widget-settings/WidgetEditorContext';
import { usePanelWidgetId } from '@features/widget-settings/setting-rows';
import { schemaRows } from '@features/widget-settings/schema-rows';
import {
  BlockHint,
  BlockSubtitle,
  CheckGrid,
  RadioColumn,
  SettingsBlock,
  StepperRow,
  type CheckItem,
} from '@features/widget-settings/blocks/SettingsBlocks';
import {
  AVG_LAP_MODE,
  CLOCK_FORMAT,
  NAME_FORMAT,
  RACE_TIMER,
  type AvgLapMode,
  type ClockFormat,
  type NameFormat,
  type RaceTimer,
} from '@shared/contracts/widget-choices';
import {
  RELATIVE_SETTINGS,
  type RelativeWidgetSettings,
} from './settings-schema';

// Widget ids this panel configures — read by the panel registry.
export const PANEL_WIDGET_IDS = ['relative'];

const { Row, useLabels } = schemaRows(RELATIVE_SETTINGS);
const {
  nameColumnWidth,
  gapDecimals,
  lapTimeDecimals,
  driversAhead,
  driversBehind,
} = RELATIVE_SETTINGS.shape;

type BoolSetting = {
  [
    Key in keyof RelativeWidgetSettings
  ]: RelativeWidgetSettings[Key] extends boolean ? Key : never;
}[keyof RelativeWidgetSettings];

/** The table's parts, in the order the grid lists them. */
const LAYOUT: ReadonlyArray<{ setting: BoolSetting; label: string }> = [
  { setting: 'showCarNumber', label: 'carNumber' },
  { setting: 'showCountryFlag', label: 'countryFlag' },
  { setting: 'showLicBadge', label: 'license' },
  { setting: 'showIRating', label: 'iRating' },
  { setting: 'showIrChange', label: 'eloChange' },
  { setting: 'showTableHeader', label: 'tableHeader' },
  { setting: 'showTableFooter', label: 'tableFooter' },
  { setting: 'showRealTimeClock', label: 'realTimeClock' },
  { setting: 'showPosChange', label: 'positionChange' },
  { setting: 'showLapNumber', label: 'lapNumber' },
  { setting: 'showAvgLap', label: 'averageLap' },
  { setting: 'showLastLap', label: 'lastLap' },
  { setting: 'showBestLap', label: 'bestLap' },
  { setting: 'showTire', label: 'tyreCompound' },
  { setting: 'showStintLaps', label: 'lapsInStint' },
  { setting: 'showDriverFlags', label: 'flags' },
  { setting: 'showPitIndicator', label: 'pitInformation' },
  { setting: 'showColumnHeaders', label: 'columnHeaders' },
];

/** The text size choices, as the font scale they set. */
const TEXT_SIZES = [
  { value: 'normal', scale: 1 },
  { value: 'large', scale: 1.15 },
  { value: 'larger', scale: 1.3 },
] as const;

type TextSize = (typeof TEXT_SIZES)[number]['value'];

const textSizeOf = (fontScale: number | undefined): TextSize =>
  TEXT_SIZES.reduce((closest, size) =>
    Math.abs(size.scale - (fontScale ?? 1)) <
    Math.abs(closest.scale - (fontScale ?? 1))
      ? size
      : closest
  ).value;

const NAME_COLUMN_SLIDER_WIDTH_PX = 160;

export const RelativeSettingsPanel = observer(() => {
  const liveWidgets = useWidgetEditor();
  const panelWidgetId = usePanelWidgetId('relative');
  const { t } = useTranslation('widgets');
  const nameColumnLabels = useLabels('nameColumnWidth');

  const settings =
    liveWidgets.getSettings<RelativeWidgetSettings>(panelWidgetId);

  // The font scale is a frame setting every widget has, not one of the schema's.
  const update = (
    partial: Parameters<typeof liveWidgets.updateUserSettings>[1]
  ) => liveWidgets.updateUserSettings(panelWidgetId, partial);

  const layoutItems: CheckItem[] = LAYOUT.map(({ setting, label }) => ({
    key: setting,
    label: t(`settingsPanels.common.layout_${label}`),
    checked: settings[setting],
  }));

  return (
    <>
      <Card title={t('settingsPanels.relative.layout')} defaultOpen>
        <SettingsBlock title={t('settingsPanels.relative.density')}>
          <RadioColumn<'normal' | 'compact'>
            inline
            name="relative-density"
            value={settings.rowPadding === 'narrow' ? 'compact' : 'normal'}
            options={[
              {
                value: 'normal',
                label: t('settingsPanels.relative.density_normal'),
              },
              {
                value: 'compact',
                label: t('settingsPanels.relative.density_compact'),
              },
            ]}
            onChange={(value) =>
              update({ rowPadding: value === 'compact' ? 'narrow' : 'medium' })
            }
          />
        </SettingsBlock>

        <SettingsBlock title={t('settingsPanels.relative.textSize')}>
          <RadioColumn<TextSize>
            inline
            name="relative-text-size"
            value={textSizeOf(settings.fontScale)}
            options={TEXT_SIZES.map((size) => ({
              value: size.value,
              label: t(`settingsPanels.relative.textSize_${size.value}`),
            }))}
            onChange={(value) =>
              update({
                fontScale: TEXT_SIZES.find((size) => size.value === value)
                  ?.scale,
              })
            }
          />
        </SettingsBlock>

        <SettingsBlock title={t('settingsPanels.relative.raceTimer')}>
          <RadioColumn<RaceTimer>
            inline
            name="relative-race-timer"
            value={settings.raceTimer}
            options={RACE_TIMER.map((timer) => ({
              value: timer,
              label: t(`settingsPanels.relative.raceTimer_${timer}`),
            }))}
            onChange={(value) => update({ raceTimer: value })}
          />
        </SettingsBlock>

        <SettingsBlock title={t('settingsPanels.relative.nameFormat')}>
          <RadioColumn<NameFormat>
            inline
            name="relative-name-format"
            value={settings.nameFormat}
            options={NAME_FORMAT.map((format) => ({
              value: format,
              label: t(`settingsPanels.relative.nameFormat_${format}`),
            }))}
            onChange={(value) => update({ nameFormat: value })}
          />
        </SettingsBlock>

        <SettingsBlock title={t('settingsPanels.relative.iRatingDisplay')}>
          <RadioColumn<'short' | 'full'>
            inline
            name="relative-irating"
            value={settings.abbreviateIRating ? 'short' : 'full'}
            options={[
              { value: 'short', label: '10.4K' },
              { value: 'full', label: '10437' },
            ]}
            onChange={(value) =>
              update({ abbreviateIRating: value === 'short' })
            }
          />
        </SettingsBlock>

        {settings.showRealTimeClock && (
          <SettingsBlock title={t('settingsPanels.relative.clockFormat')}>
            <RadioColumn<ClockFormat>
              inline
              name="relative-clock-format"
              value={settings.clockFormat}
              options={CLOCK_FORMAT.map((format) => ({
                value: format,
                label: format === '24h' ? '22:47' : '10:47 PM',
              }))}
              onChange={(value) => update({ clockFormat: value })}
            />
          </SettingsBlock>
        )}

        <SettingsBlock title={t('settingsPanels.common.layoutTitle')}>
          <CheckGrid
            items={layoutItems}
            onToggle={(key, checked) =>
              update({ [key]: checked } as Partial<RelativeWidgetSettings>)
            }
          />

          <BlockSubtitle>
            {t('settingsPanels.common.layout_averageLap')}
          </BlockSubtitle>
          <RadioColumn<AvgLapMode>
            name="relative-avg-lap"
            value={settings.avgLapMode}
            options={AVG_LAP_MODE.map((mode) => ({
              value: mode,
              label: t(`settingsPanels.common.avgLapMode_${mode}`),
            }))}
            onChange={(value) => update({ avgLapMode: value })}
          />
          <BlockHint>{t('settingsPanels.common.avgLapModeDesc')}</BlockHint>
        </SettingsBlock>

        <SettingsBlock title={t('settingsPanels.common.timing')}>
          <StepperRow
            label={t('settingsPanels.common.gapDecimalsShort')}
            value={settings.gapDecimals}
            min={gapDecimals.min}
            max={gapDecimals.max}
            onChange={(value) => update({ gapDecimals: value })}
          />
          <StepperRow
            label={t('settingsPanels.common.lapTimeDecimalsShort')}
            value={settings.lapTimeDecimals}
            min={lapTimeDecimals.min}
            max={lapTimeDecimals.max}
            onChange={(value) => update({ lapTimeDecimals: value })}
          />
        </SettingsBlock>

        <SettingsBlock title={t('settingsPanels.common.driversShown')}>
          <StepperRow
            label={t('settingsPanels.common.driversAheadShort')}
            value={settings.driversAhead}
            min={driversAhead.min}
            max={driversAhead.max}
            onChange={(value) => update({ driversAhead: value })}
          />
          <StepperRow
            label={t('settingsPanels.common.driversBehindShort')}
            value={settings.driversBehind}
            min={driversBehind.min}
            max={driversBehind.max}
            onChange={(value) => update({ driversBehind: value })}
          />
        </SettingsBlock>
      </Card>

      <Card title={t('settingsPanels.relative.appearance')}>
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

      <Card title={t('settingsPanels.common.dataColumns')}>
        <Row setting="licBadgeStyle" dependsOn="showLicBadge" />
        <Row setting="showLicenseLetter" dependsOn="showLicBadge" />
        <Row setting="showRadioMark" />
      </Card>

      <Card title={t('settingsPanels.common.safetyCar')}>
        <div className={styles.fieldGroup}>
          <Row setting="paceCarShowInPits" />
        </div>
      </Card>

      <Card title={t('settingsPanels.common.qualifying')}>
        <div className={styles.fieldGroup}>
          <Row setting="qualifyingVisibility" />
        </div>
      </Card>
    </>
  );
});
