import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Button, Empty, Flex, Input, Radio, Tag, Tooltip } from 'antd';
import { FileUp, Pin, RefreshCw, Trash2 } from 'lucide-react';

import { SettingsCard } from '@shared/ui/SettingsCard/SettingsCard';
import type { ReferencePolicy } from '@shared/contracts/reflaps';
import { useReferenceLapsStore } from './reference-laps-context';
import { formatLapTime } from './reference-laps.store';
import styles from './ReferenceLapsSection.module.scss';

const ICON_SIZE = 14;

type PolicySource = ReferencePolicy['source'];

const SELECTABLE: PolicySource[] = ['auto', 'library', 'personalBest'];

/**
 * Garage 61 token, which reference the session gets, and the lap library
 * (ADR-0013). The token field is write-only: a saved token is never shown
 * again, only that one is stored.
 */
export const ReferenceLapsSection = observer(() => {
  const laps = useReferenceLapsStore();
  const { t } = useTranslation('main-app');
  const [tokenDraft, setTokenDraft] = useState('');

  useEffect(() => {
    laps.start();

    return () => laps.stop();
  }, [laps]);

  const status = laps.status;
  const pinnedId = laps.policy.source === 'pinned' ? laps.policy.lapId : null;

  return (
    <SettingsCard title={t('settingsPage.referenceLaps.title')}>
      <div className={styles.fieldGroup}>
        <div className={styles.fieldTitle}>
          {t('settingsPage.referenceLaps.tokenTitle')}
        </div>
        <div className={styles.fieldDesc}>
          {t('settingsPage.referenceLaps.tokenDesc')}
        </div>

        {laps.hasToken ? (
          <Flex gap={8} align="center">
            <Tag color="green">
              {t('settingsPage.referenceLaps.tokenStored')}
            </Tag>
            <Button
              size="small"
              danger
              disabled={laps.busy}
              onClick={() => void laps.clearToken()}
            >
              {t('settingsPage.referenceLaps.tokenRemove')}
            </Button>
          </Flex>
        ) : (
          <Flex gap={8}>
            <Input.Password
              size="small"
              autoComplete="off"
              placeholder={t('settingsPage.referenceLaps.tokenPlaceholder')}
              value={tokenDraft}
              maxLength={512}
              onChange={(event) => setTokenDraft(event.target.value)}
            />
            <Button
              size="small"
              type="primary"
              disabled={laps.busy || tokenDraft.trim().length < 8}
              onClick={() => {
                void laps.saveToken(tokenDraft).then(() => setTokenDraft(''));
              }}
            >
              {t('settingsPage.referenceLaps.tokenSave')}
            </Button>
          </Flex>
        )}
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.fieldTitle}>
          {t('settingsPage.referenceLaps.sourceTitle')}
        </div>
        <div className={styles.fieldDesc}>
          {t('settingsPage.referenceLaps.sourceDesc')}
        </div>

        <Radio.Group
          size="small"
          value={laps.policy.source}
          disabled={laps.busy}
          onChange={(event) => {
            const source = event.target.value as PolicySource;

            if (source !== 'pinned') void laps.setPolicy({ source });
          }}
        >
          {SELECTABLE.map((source) => (
            <Radio.Button key={source} value={source}>
              {t(`settingsPage.referenceLaps.sources.${source}`)}
            </Radio.Button>
          ))}
          {pinnedId ? (
            <Radio.Button value="pinned">
              {t('settingsPage.referenceLaps.sources.pinned')}
            </Radio.Button>
          ) : null}
        </Radio.Group>

        <Flex gap={8} align="center" style={{ marginTop: 12 }}>
          <span className={styles.status}>
            {status
              ? t(`settingsPage.referenceLaps.notes.${status.note}`, {
                  time: formatLapTime(status.lapTime),
                  driver: status.driver ?? '—',
                })
              : t('settingsPage.referenceLaps.noSession')}
          </span>
          <Tooltip title={t('settingsPage.referenceLaps.refreshHint')}>
            <Button
              size="small"
              icon={<RefreshCw size={ICON_SIZE} />}
              disabled={laps.busy || !laps.hasToken}
              onClick={() => void laps.refresh()}
            />
          </Tooltip>
        </Flex>
      </div>

      <div className={styles.fieldGroup}>
        <Flex justify="space-between" align="center">
          <div className={styles.fieldTitle}>
            {t('settingsPage.referenceLaps.libraryTitle')}
          </div>
          <Button
            size="small"
            icon={<FileUp size={ICON_SIZE} />}
            disabled={laps.busy}
            onClick={() => void laps.importCsv()}
          >
            {t('settingsPage.referenceLaps.importCsv')}
          </Button>
        </Flex>
        <div className={styles.fieldDesc}>
          {t('settingsPage.referenceLaps.libraryDesc')}
        </div>

        {laps.laps.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('settingsPage.referenceLaps.libraryEmpty')}
          />
        ) : (
          laps.laps.map((lap) => (
            <div key={lap.id} className={styles.lapRow}>
              <span className={styles.lapTime}>
                {formatLapTime(lap.lapTime)}
              </span>
              <span className={styles.lapMain}>
                {[lap.trackName, lap.carName].filter(Boolean).join(' · ')}
                <span className={styles.lapMuted}>
                  {lap.driver ? ` — ${lap.driver}` : ''}
                </span>
              </span>
              <Tag>
                {t(`settingsPage.referenceLaps.lapSource.${lap.source}`)}
              </Tag>
              <Tag color={lap.status === 'match' ? 'green' : undefined}>
                {t(`settingsPage.referenceLaps.match.${lap.status}`)}
              </Tag>
              <Tooltip title={t('settingsPage.referenceLaps.pin')}>
                <Button
                  size="small"
                  type={pinnedId === lap.id ? 'primary' : 'default'}
                  icon={<Pin size={ICON_SIZE} />}
                  disabled={laps.busy}
                  onClick={() => void laps.pin(lap.id)}
                />
              </Tooltip>
              <Tooltip title={t('settingsPage.referenceLaps.delete')}>
                <Button
                  size="small"
                  danger
                  icon={<Trash2 size={ICON_SIZE} />}
                  disabled={laps.busy}
                  onClick={() => void laps.deleteLap(lap.id)}
                />
              </Tooltip>
            </div>
          ))
        )}

        {laps.error ? <div className={styles.error}>{laps.error}</div> : null}
      </div>
    </SettingsCard>
  );
});
