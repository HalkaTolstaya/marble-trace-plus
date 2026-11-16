import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Select, Slider, Switch } from 'antd';
import { Minus, Plus } from 'lucide-react';
import { WidgetPreview } from '../WidgetPreview/WidgetPreview';
import { WidgetSettings } from '@features/widget-settings/WidgetSettings';
import { DefaultsEditorProvider } from '@features/widget-settings/WidgetEditorContext';
import {
  PREVIEW_SCENARIO_BY_ID,
  DEFAULT_PREVIEW_SCENARIO_ID,
} from '@features/preview/scenarios';
import { WIDGET_BY_ID } from '@entities/widget/widget-catalog';
import { useAppSettingsStore } from '@entities/app-settings/app-settings-context';
import { useWidgetDefaultsStore } from '@entities/widget/widget-defaults-context';
import {
  getWidgetDescription,
  getWidgetLabel,
} from '@entities/widget/widget-i18n';
import styles from './WidgetWorkbench.module.scss';

const scenarioOption = (scenarioId: string) => {
  const scenario = PREVIEW_SCENARIO_BY_ID.get(scenarioId);

  return scenario ? [{ value: scenario.id, label: scenario.label }] : [];
};

// A widget offers the scenarios its own manifest declares, and nothing else.
// One that declares none has no states of its own to switch between, so it gets
// no picker at all — its preview still renders against the base snapshot.
//
// The baseline leads the list without being declared anywhere: it is the
// absence of a forced state rather than a state of its own, and leaving it out
// stranded the driver on the first scenario they picked, with nothing to pick
// to get back.
//
// Unless the widget says the baseline is not one of its states at all — the
// baseline car is a GT3, and a widget reading hardware it does not carry draws
// nothing against it. Offering that is offering an empty pane.
const scenarioOptionsFor = (widgetId: string) => {
  const manifest = WIDGET_BY_ID.get(widgetId);
  const declared = manifest?.previewScenarios ?? [];

  if (declared.length === 0) {
    return [];
  }

  const baseline =
    manifest?.previewBaseline === false
      ? []
      : scenarioOption(DEFAULT_PREVIEW_SCENARIO_ID);

  return [
    ...baseline,
    ...declared
      .filter((scenarioId) => scenarioId !== DEFAULT_PREVIEW_SCENARIO_ID)
      .flatMap(scenarioOption),
  ];
};

// What a widget opens on: the first state it declares, not the baseline.
//
// A manifest declares scenarios because those are the states the widget is
// worth looking at in, and some widgets cannot draw the baseline at all — it is
// a GT3, so the battery and the hybrid readouts render nothing against it and
// the pane opens blank on a widget the driver just clicked to look at. The
// baseline still leads the picker, one click away.
const openingScenarioFor = (widgetId: string): string =>
  WIDGET_BY_ID.get(widgetId)?.previewScenarios?.[0] ??
  DEFAULT_PREVIEW_SCENARIO_ID;

const TRANSPARENCY_SLIDER_STEP = 5;

interface WidgetWorkbenchProps {
  widgetId: string | null;
  onSelect: (widgetId: string) => void;
}

/**
 * The widgets page: every widget in one list, the open one showing its
 * settings in place, and beside the list a live preview of it over a drawn
 * track with the overlay transparency under it. Opening a row is picking the
 * widget the preview shows.
 */
export const WidgetWorkbench = observer(
  ({ widgetId, onSelect }: WidgetWorkbenchProps) => {
    const { t } = useTranslation('main-app');
    const widgetDefaults = useWidgetDefaultsStore();

    return (
      <DefaultsEditorProvider>
        <div className={styles.root}>
          <div className={styles.listColumn}>
            {widgetDefaults.catalogWidgets.map((widget) => {
              const isOpen = widget.id === widgetId;
              const isAvailable = widgetDefaults.availableWidgetIds.includes(
                widget.id
              );

              return (
                <section
                  key={widget.id}
                  className={`${styles.widgetRow} ${isOpen ? styles.widgetRowOpen : ''} ${isAvailable ? '' : styles.widgetRowUnavailable}`}
                >
                  <button
                    type="button"
                    className={styles.widgetRowHeader}
                    disabled={!isAvailable}
                    aria-expanded={isOpen}
                    onClick={() => onSelect(widget.id)}
                  >
                    <span className={styles.widgetRowTitle}>
                      {getWidgetLabel(t, widget)}
                    </span>
                    <span className={styles.widgetRowTag}>
                      {isAvailable
                        ? getWidgetDescription(t, widget) ||
                          t('widgetList.defaultDescription')
                        : t('widgetList.unavailable')}
                    </span>
                    <span className={styles.widgetRowToggle} aria-hidden>
                      {isOpen ? <Minus size={14} /> : <Plus size={14} />}
                    </span>
                  </button>

                  {isOpen && (
                    <div className={styles.widgetRowBody}>
                      <WidgetSettings widgetId={widget.id} hideHeader />
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          <div className={styles.previewColumn}>
            {widgetId ? (
              <WidgetPreviewPane widgetId={widgetId} />
            ) : (
              <div className={styles.empty}>
                {t('widgetWorkbench.noWidgets')}
              </div>
            )}
          </div>
        </div>
      </DefaultsEditorProvider>
    );
  }
);

/** The preview of one widget: scenario, live race, the scene, transparency. */
const WidgetPreviewPane = observer(({ widgetId }: { widgetId: string }) => {
  const { t } = useTranslation('main-app');
  const appSettings = useAppSettingsStore();
  // Pinned to the widget it was picked on: a pick says "show me this state of
  // this widget", and carrying it to the next widget shows another domain's
  // state or, on a widget that cannot draw it, nothing at all.
  const [picked, setPicked] = useState<{
    widgetId: string;
    scenarioId: string;
  } | null>(null);
  const [live, setLive] = useState(true);

  const scenarioOptions = scenarioOptionsFor(widgetId);
  const isPickedHere =
    picked?.widgetId === widgetId &&
    scenarioOptions.some((option) => option.value === picked.scenarioId);
  const activeScenarioId = isPickedHere
    ? picked.scenarioId
    : openingScenarioFor(widgetId);

  return (
    <>
      <div className={styles.scenarioBar}>
        {scenarioOptions.length > 0 && (
          <>
            <span className={styles.scenarioLabel}>
              {t('widgetWorkbench.scenario')}
            </span>
            <Select
              size="small"
              value={activeScenarioId}
              onChange={(scenarioId) => setPicked({ widgetId, scenarioId })}
              options={scenarioOptions}
              style={{ minWidth: 160 }}
              popupMatchSelectWidth={false}
            />
          </>
        )}

        <label className={styles.liveToggle}>
          <Switch size="small" checked={live} onChange={setLive} />
          <span className={styles.scenarioLabel}>
            {t('widgetWorkbench.live')}
          </span>
        </label>
      </div>

      {/* The widget over a drawn track, as it sits over the game. */}
      <div className={`${styles.previewPane} ${styles.scene}`}>
        <WidgetPreview
          key={widgetId}
          widgetId={widgetId}
          scenarioId={activeScenarioId}
          live={live}
        />
      </div>

      <div className={styles.transparencyBar}>
        <span className={styles.transparencyTitle}>
          {t('settingsPage.overlayTransparency.title')}
        </span>
        <span className={styles.transparencyValue}>
          {appSettings.appSettings.overlayTransparency}%
        </span>
        <Slider
          className={styles.transparencySlider}
          min={0}
          max={100}
          step={TRANSPARENCY_SLIDER_STEP}
          value={appSettings.appSettings.overlayTransparency}
          tooltip={{ open: false }}
          onChange={(value) => appSettings.setOverlayTransparency(value)}
        />
      </div>
    </>
  );
});
