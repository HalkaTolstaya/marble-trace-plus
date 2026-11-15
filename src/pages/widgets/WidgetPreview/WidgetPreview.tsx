import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useAppSettingsStore } from '@entities/app-settings/app-settings-context';
import { useTranslation } from 'react-i18next';
import { usePreviewWorldFactory } from '@features/preview/preview-host-context';
import { useUnitsStore } from '@entities/app-settings/units-context';
import { useWidgetEditor } from '@features/widget-settings/WidgetEditorContext';
import { componentForWidget } from '@widgets/registry';
import { WidgetInstanceScope } from '@widgets/instance-scope/WidgetInstanceScope';
import { WidgetIdContext } from '@entities/widget/WidgetIdContext';
import { ErrorBoundary } from '@shared/ui/ErrorBoundary';
import { widgetBoxSize, widgetFrameStyle } from '@entities/widget/widget-frame';
import {
  seedScenario,
  DEFAULT_PREVIEW_SCENARIO_ID,
} from '@features/preview/scenarios';
import { seedInputHistory } from '@features/preview/preview-animator';
import { LiveRacePreview } from '@features/preview/live-race';
import styles from './WidgetPreview.module.scss';

/** The stage's padding each side, as in its stylesheet (`sp(xl)`). */
const STAGE_PADDING_PX = 16;

interface WidgetPreviewProps {
  widgetId: string;
  scenarioId?: string;
  /** Run the race: cars lap, trade places and close laps; pedals move. */
  live?: boolean;
}

// Renders a single widget the way the overlay would, but inside the main window
// against a seeded sample scenario. Settings are mirrored live from the main
// store so editing a panel updates the preview without touching real data.
export const WidgetPreview = observer(
  ({
    widgetId,
    scenarioId = DEFAULT_PREVIEW_SCENARIO_ID,
    live = false,
  }: WidgetPreviewProps) => {
    const editor = useWidgetEditor();
    const [stage, setStage] = useState<HTMLDivElement | null>(null);
    const [fitScale, setFitScale] = useState(1);
    // The panels as the overlay draws them, with the app's transparency.
    const { overlayTransparency } = useAppSettingsStore().appSettings;
    const units = useUnitsStore();
    const { t } = useTranslation('main-app');

    const createPreviewWorld = usePreviewWorldFactory();
    const previewWorld = useMemo(
      () => createPreviewWorld(),
      [createPreviewWorld]
    );
    const previewStore = previewWorld.core;
    const PreviewProvide = previewWorld.Provide;

    useEffect(() => () => previewStore.dispose(), [previewStore]);

    useLayoutEffect(() => {
      seedScenario(previewStore, scenarioId);
    }, [previewStore, scenarioId]);

    useEffect(() => {
      seedInputHistory(previewStore);
    }, [previewStore, scenarioId]);

    // Started after the scenario is seeded, from the field it left; a new
    // scenario starts a new race.
    useEffect(() => {
      if (!live) {
        return;
      }

      const race = new LiveRacePreview(previewStore);

      race.start();

      return () => race.stop();
    }, [previewStore, scenarioId, live]);

    // The preview store is its own world, units included — without this it
    // stays metric while the app is set to imperial, and every distance in the
    // preview contradicts the widget on the overlay.
    useLayoutEffect(() => {
      previewStore.units.setSystem(units.unitSystem);
    }, [previewStore, units.unitSystem]);

    const widget = editor.getWidget(widgetId);

    // The preview world holds one record per widget, seeded from the catalog,
    // so a copy is mirrored onto its type's record there rather than added
    // beside it: the preview shows what this copy looks like, and only ever one
    // widget at a time.
    const previewId = widget ? widget.type : widgetId;

    // Read the change token so the effect re-mirrors on any settings change.
    const mutationToken = editor.getChangeToken();

    useLayoutEffect(() => {
      if (!widget) return;

      previewStore.liveWidgets.applySettingsSync([
        {
          id: previewId,
          type: widget.type,
          label: widget.label,
          description: widget.description,
          designWidth: widget.designWidth,
          designHeight: widget.designHeight,
          autoHeight: widget.autoHeight,
          contentSized: widget.contentSized,
          overflowVisible: widget.overflowVisible,
          transparentContainer: widget.transparentContainer,
          requiredCapabilities: widget.requiredCapabilities,
          userSettings: { ...widget.userSettings },
        },
      ]);
    }, [previewStore, widget, previewId, mutationToken]);

    const Widget = componentForWidget(previewId);

    // A widget wider than the pane is shown whole, scaled down to fit; one
    // that fits stays at its own size.
    useLayoutEffect(() => {
      if (!stage) {
        return;
      }

      const measure = () => {
        const frame = stage.firstElementChild;

        if (!(frame instanceof HTMLElement) || frame.offsetWidth === 0) {
          return;
        }

        const available = stage.clientWidth - STAGE_PADDING_PX * 2;

        setFitScale(Math.min(1, available / frame.offsetWidth));
      };

      const observer = new ResizeObserver(measure);

      observer.observe(stage);

      if (stage.firstElementChild) {
        observer.observe(stage.firstElementChild);
      }

      measure();

      return () => observer.disconnect();
    }, [stage, previewId]);

    if (!widget || !Widget) {
      return <div className={styles.empty}>{t('widgetPreview.noPreview')}</div>;
    }

    const {
      userSettings,
      designWidth,
      autoHeight,
      contentSized,
      overflowVisible,
    } = widget;
    const widgetScale = widget.scaleFromHeight
      ? userSettings.currentHeight / widget.designHeight
      : userSettings.currentWidth / designWidth;
    const frameStyle = widgetFrameStyle({
      widgetType: widget ? widget.type : widgetId,
      userSettings,
      widgetScale,
      transparentContainer: widget.transparentContainer,
      autoHeight,
      contentSized,
      overlayTransparency: overlayTransparency,
    });

    return (
      <PreviewProvide>
        <div ref={setStage} className={styles.stage}>
          <div
            className={`${styles.widgetInner} ${
              overflowVisible ? styles.overflowVisible : ''
            }`}
            style={{
              ...widgetBoxSize({
                width: userSettings.currentWidth,
                height: userSettings.currentHeight,
                autoHeight,
                contentSized,
              }),
              ...frameStyle,
              zoom: fitScale,
            }}
          >
            <ErrorBoundary>
              <WidgetIdContext.Provider value={previewId}>
                <WidgetInstanceScope type={widget.type} instanceId={previewId}>
                  <Widget />
                </WidgetInstanceScope>
              </WidgetIdContext.Provider>
            </ErrorBoundary>
          </div>
        </div>
      </PreviewProvide>
    );
  }
);
