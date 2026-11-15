import { createStoreContext } from '@shared/lib/store-context';
import type { ReferenceLapsStore } from './reference-laps.store';

export const [ReferenceLapsContext, useReferenceLapsStore] =
  createStoreContext<ReferenceLapsStore>('ReferenceLapsStore');
