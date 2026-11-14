import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  getReflapsOverview: vi.fn(),
  setGarage61Token: vi.fn(),
  clearGarage61Token: vi.fn(),
  setReferencePolicy: vi.fn(),
  refreshReference: vi.fn(),
  deleteLibraryLap: vi.fn(),
  importLapCsv: vi.fn(),
  listenReflapsStatus: vi.fn(),
}));

vi.mock('@shared/api/reflaps.service', () => service);

import { ReferenceLapsStore, formatLapTime } from './reference-laps.store';

const overview = (hasToken: boolean) => ({
  hasToken,
  policy: { source: 'auto' as const },
  status: null,
  laps: [],
});

describe('ReferenceLapsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.getReflapsOverview.mockResolvedValue(overview(false));
    service.listenReflapsStatus.mockResolvedValue(() => {});
  });

  it('hands the token to Rust and keeps nothing of it', async () => {
    const store = new ReferenceLapsStore();

    service.setGarage61Token.mockResolvedValue(undefined);
    service.getReflapsOverview.mockResolvedValue(overview(true));

    await store.saveToken('g61-secret-token');

    expect(service.setGarage61Token).toHaveBeenCalledWith('g61-secret-token');
    expect(store.hasToken).toBe(true);
    expect(JSON.stringify(store)).not.toContain('g61-secret-token');
  });

  it('shows a refused command as an error and stays usable', async () => {
    const store = new ReferenceLapsStore();

    service.setGarage61Token.mockRejectedValue('the token looks malformed');

    await store.saveToken('bad');

    expect(store.error).toContain('malformed');
    expect(store.busy).toBe(false);
  });

  it('pins a lap through the policy', async () => {
    const store = new ReferenceLapsStore();
    const id = 'a'.repeat(64);

    service.setReferencePolicy.mockResolvedValue(undefined);
    await store.pin(id);

    expect(service.setReferencePolicy).toHaveBeenCalledWith({
      source: 'pinned',
      lapId: id,
    });
  });

  it('formats lap times like the sim', () => {
    expect(formatLapTime(115.992)).toBe('1:55.992');
    expect(formatLapTime(59.9996)).toBe('1:00.000');
    expect(formatLapTime(null)).toBe('–');
  });
});
