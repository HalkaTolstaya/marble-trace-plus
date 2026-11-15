import { useWidgetSettings } from '@entities/layout/useWidgetSettings';
import { observer } from 'mobx-react-lite';

import { WidgetPanel } from '@shared/ui/WidgetPanel/WidgetPanel';
import { InputBars } from './InputBars/InputBars';
import { CanvasTrace } from './CanvasTrace/CanvasTrace';
import { CornerSpeeds } from './SpeedBlock/CornerSpeeds';
import { SpeedGear } from './SpeedBlock/SpeedGear';
import { SteeringWheel } from './SteeringWheel/SteeringWheel';
import { RevStrip } from './RevStrip/RevStrip';
import { DistanceTag } from './CanvasTrace/DistanceTag';

import styles from './InputTraceWidget.module.scss';
import type { InputTraceSettings } from './settings-schema';

export const InputTraceWidget = observer(() => {
  const settings = useWidgetSettings<InputTraceSettings>('input-trace');

  const barsEffectivelyHidden =
    !settings.showBars ||
    (!settings.showThrottle && !settings.showBrake && !settings.showClutch);

  const showTrace = settings.showTrace;

  const allHidden =
    !showTrace &&
    !settings.showSteering &&
    !settings.showSpeedGear &&
    !settings.showCornerSpeeds &&
    barsEffectivelyHidden;

  if (allHidden) {
    return (
      <WidgetPanel direction="row" gap={8} edgeInset>
        <div className={styles.emptyState}>
          Input widget. All elements hidden in settings
        </div>
      </WidgetPanel>
    );
  }

  // Without the graph there is no left of it: the block keeps its place.
  const speedBlockOnLeft = showTrace && settings.speedBlockSide === 'left';

  const speedBlock = (
    <>
      <CornerSpeeds />

      <SpeedGear />
    </>
  );

  const content = (
    <>
      {speedBlockOnLeft && speedBlock}

      {showTrace && (
        <div className={styles.chartArea}>
          <CanvasTrace />
          {settings.showDistance && <DistanceTag />}
        </div>
      )}

      <InputBars />

      {!speedBlockOnLeft && speedBlock}

      <SteeringWheel />
    </>
  );

  if (!settings.showRevLights) {
    return (
      <WidgetPanel direction="row" gap={8} edgeInset>
        {content}
      </WidgetPanel>
    );
  }

  // The rev lights run across the top; everything else keeps its row below.
  return (
    <WidgetPanel direction="column" gap={0} edgeInset>
      <RevStrip />
      <div className={styles.contentRow}>{content}</div>
    </WidgetPanel>
  );
});
