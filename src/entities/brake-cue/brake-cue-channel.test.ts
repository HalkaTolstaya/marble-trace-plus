import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  configureBrakeCue: vi.fn(),
  listenBrakeCue: vi.fn(),
}));

vi.mock('@shared/api/reflaps.service', () => service);

import { BrakeCueChannel } from './brake-cue-channel';

const CONFIG = { lead: 3, early: 0, minPeak: 0.15, tol: 0.08, perfect: 0.03 };

describe('BrakeCueChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.configureBrakeCue.mockResolvedValue(undefined);
    service.listenBrakeCue.mockResolvedValue(() => {});
  });

  it('switches the cue off only when the last channel closes', () => {
    const first = new BrakeCueChannel(() => {});
    const second = new BrakeCueChannel(() => {});

    first.configure(CONFIG);
    expect(service.configureBrakeCue).toHaveBeenLastCalledWith(true, CONFIG);

    first.close(CONFIG);
    expect(service.configureBrakeCue).not.toHaveBeenCalledWith(false, CONFIG);

    second.close(CONFIG);
    expect(service.configureBrakeCue).toHaveBeenLastCalledWith(false, CONFIG);
  });

  it('ignores configure and close after it closed', () => {
    const only = new BrakeCueChannel(() => {});

    only.close(CONFIG);
    service.configureBrakeCue.mockClear();
    only.configure(CONFIG);
    only.close(CONFIG);

    expect(service.configureBrakeCue).not.toHaveBeenCalled();
  });

  it('drops a listener that arrives after close', async () => {
    const unlisten = vi.fn();

    service.listenBrakeCue.mockResolvedValue(unlisten);

    const channel = new BrakeCueChannel(() => {});

    channel.close(CONFIG);
    await Promise.resolve();
    await Promise.resolve();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
