import { alpaca } from '@/backend/services/alpacaService';
import { logger } from '@/backend/services/structuredLogger';
import type { MarketClock } from '@/types/domain';
import type { Result } from '@/backend/services/alpacaService';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — matches MONITOR_INTERVAL_MS default

export class MarketHoursService {
  private cached: MarketClock | null = null;
  private lastFetched = 0;
  private readonly alpaca: { getClock(): Promise<Result<MarketClock>> };

  constructor(alpacaSvc?: { getClock(): Promise<Result<MarketClock>> }) {
    this.alpaca = alpacaSvc ?? alpaca;
  }

  /** Returns true if the US equity market is currently open (or if we can't determine, assumes open). */
  async isOpen(): Promise<boolean> {
    const now = Date.now();

    if (this.cached && now - this.lastFetched < CACHE_TTL_MS) {
      return this.cached.isOpen;
    }

    const result = await this.alpaca.getClock();
    if (result.ok) {
      this.cached = result.value;
      this.lastFetched = now;
      return result.value.isOpen;
    }

    // Alpaca unreachable — try to infer from stale cache timestamps
    if (this.cached) {
      const inferred = this.inferFromCached(now);
      logger.warn('marketHours', 'Alpaca clock failed, using cached inference', {
        cachedIsOpen: this.cached.isOpen,
        cachedNextOpen: this.cached.nextOpen,
        cachedNextClose: this.cached.nextClose,
        inferred,
      });
      return inferred;
    }

    // No cache at all — conservative: assume open so dead-man's switch stays active
    logger.warn('marketHours', 'Alpaca clock failed and no cache, assuming open');
    return true;
  }

  private inferFromCached(now: number): boolean {
    const cachedNextClose = new Date(this.cached!.nextClose).getTime();
    const cachedNextOpen = new Date(this.cached!.nextOpen).getTime();

    if (this.cached!.isOpen) {
      return now < cachedNextClose;
    }
    return now >= cachedNextOpen;
  }
}

export const marketHours = new MarketHoursService();
