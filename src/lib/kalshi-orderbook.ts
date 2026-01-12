// Kalshi Orderbook Manager
// Manages orderbook state per market ticker and extracts best bid/ask prices

export interface OrderbookLevel {
  price: number;      // In cents (0-100)
  quantity: number;   // Number of contracts
}

export interface Orderbook {
  marketTicker: string;
  yes: OrderbookLevel[];  // Yes side bids (sorted by price descending)
  no: OrderbookLevel[];   // No side bids (sorted by price descending)
  seq: number;            // Sequence number for ordering
  lastUpdated: Date;
}

export interface OrderbookSnapshot {
  market_ticker: string;
  yes: [number, number][];  // [price, quantity] pairs
  no: [number, number][];   // [price, quantity] pairs
  seq: number;
}

export interface OrderbookDelta {
  market_ticker: string;
  price: number;
  delta: number;  // Positive = add, negative = remove
  side: 'yes' | 'no';
  seq: number;
}

export interface KalshiPrices {
  yes: number;   // 0-1 probability
  no: number;    // 0-1 probability
  yesRaw: number; // Raw cents value
  noRaw: number;  // Raw cents value
  lastUpdated: Date;
  isRealtime: boolean;
}

export class KalshiOrderbookManager {
  private orderbooks: Map<string, Orderbook> = new Map();
  private priceCallbacks: Map<string, Set<(prices: KalshiPrices) => void>> = new Map();

  /**
   * Apply an orderbook snapshot (full state)
   */
  applySnapshot(snapshot: OrderbookSnapshot): void {
    const { market_ticker, yes, no, seq } = snapshot;
    
    const orderbook: Orderbook = {
      marketTicker: market_ticker,
      yes: yes.map(([price, quantity]) => ({ price, quantity }))
        .sort((a, b) => b.price - a.price), // Sort descending
      no: no.map(([price, quantity]) => ({ price, quantity }))
        .sort((a, b) => b.price - a.price), // Sort descending
      seq,
      lastUpdated: new Date(),
    };

    this.orderbooks.set(market_ticker, orderbook);
    this.notifyPriceChange(market_ticker);
    
    console.log(`[Orderbook] Snapshot applied for ${market_ticker}: ${yes.length} yes levels, ${no.length} no levels`);
  }

  /**
   * Apply an orderbook delta (incremental update)
   */
  applyDelta(delta: OrderbookDelta): void {
    const { market_ticker, price, delta: quantityDelta, side, seq } = delta;
    
    const orderbook = this.orderbooks.get(market_ticker);
    if (!orderbook) {
      console.warn(`[Orderbook] Delta for unknown market: ${market_ticker}`);
      return;
    }

    // Skip out-of-order updates
    if (seq <= orderbook.seq) {
      return;
    }

    const levels = side === 'yes' ? orderbook.yes : orderbook.no;
    const existingIdx = levels.findIndex(l => l.price === price);

    if (existingIdx >= 0) {
      // Update existing level
      levels[existingIdx].quantity += quantityDelta;
      
      // Remove if quantity is zero or negative
      if (levels[existingIdx].quantity <= 0) {
        levels.splice(existingIdx, 1);
      }
    } else if (quantityDelta > 0) {
      // Add new level
      levels.push({ price, quantity: quantityDelta });
      // Re-sort
      levels.sort((a, b) => b.price - a.price);
    }

    orderbook.seq = seq;
    orderbook.lastUpdated = new Date();
    
    this.notifyPriceChange(market_ticker);
  }

  /**
   * Get best prices for a market (best bid on each side)
   */
  getBestPrices(marketTicker: string): KalshiPrices | null {
    const orderbook = this.orderbooks.get(marketTicker);
    if (!orderbook) return null;

    // Best yes price = highest bid on yes side (someone willing to buy yes at this price)
    const bestYes = orderbook.yes[0]?.price ?? 0;
    // Best no price = highest bid on no side (someone willing to buy no at this price)
    const bestNo = orderbook.no[0]?.price ?? 0;

    // Convert cents to probability (0-1)
    return {
      yes: bestYes / 100,
      no: bestNo / 100,
      yesRaw: bestYes,
      noRaw: bestNo,
      lastUpdated: orderbook.lastUpdated,
      isRealtime: true,
    };
  }

  /**
   * Get all tracked market tickers
   */
  getTrackedMarkets(): string[] {
    return Array.from(this.orderbooks.keys());
  }

  /**
   * Check if a market is being tracked
   */
  isTracking(marketTicker: string): boolean {
    return this.orderbooks.has(marketTicker);
  }

  /**
   * Remove a market from tracking
   */
  removeMarket(marketTicker: string): void {
    this.orderbooks.delete(marketTicker);
    this.priceCallbacks.delete(marketTicker);
  }

  /**
   * Clear all tracked markets
   */
  clear(): void {
    this.orderbooks.clear();
    this.priceCallbacks.clear();
  }

  /**
   * Subscribe to price changes for a market
   */
  onPriceChange(marketTicker: string, callback: (prices: KalshiPrices) => void): () => void {
    if (!this.priceCallbacks.has(marketTicker)) {
      this.priceCallbacks.set(marketTicker, new Set());
    }
    this.priceCallbacks.get(marketTicker)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.priceCallbacks.get(marketTicker)?.delete(callback);
    };
  }

  /**
   * Notify all subscribers of a price change
   */
  private notifyPriceChange(marketTicker: string): void {
    const prices = this.getBestPrices(marketTicker);
    if (!prices) return;

    const callbacks = this.priceCallbacks.get(marketTicker);
    if (callbacks) {
      callbacks.forEach(cb => cb(prices));
    }
  }

  /**
   * Get statistics for debugging
   */
  getStats(): { markets: number; totalLevels: number } {
    let totalLevels = 0;
    for (const orderbook of this.orderbooks.values()) {
      totalLevels += orderbook.yes.length + orderbook.no.length;
    }
    return {
      markets: this.orderbooks.size,
      totalLevels,
    };
  }
}

// Singleton instance for use across the app
export const kalshiOrderbookManager = new KalshiOrderbookManager();
