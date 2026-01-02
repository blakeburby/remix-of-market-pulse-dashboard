/**
 * Inverted index for fast market matching
 * Instead of O(n*m) comparisons, we use O(n + m) lookups
 */

import { UnifiedMarket } from '@/types/dome';

// Normalize and extract indexable terms
const STOP_WORDS = new Set([
  'will', 'the', 'a', 'an', 'in', 'on', 'at', 'by', 'for', 'to', 'of', 'be',
  'is', 'are', 'was', 'were', 'do', 'does', 'did', 'have', 'has', 'had',
  'yes', 'no', 'or', 'and', 'but', 'if', 'then', 'than', 'this', 'that',
  'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
  'before', 'after', 'during', 'between', 'above', 'below',
]);

function extractTerms(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[?!.,'"():;\[\]{}]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

function extractYear(title: string): string | null {
  const match = title.match(/\b(202[4-9]|203[0-9])\b/);
  return match ? match[1] : null;
}

function extractTicker(title: string): string | null {
  // Look for common tickers like BTC, ETH, SPX, etc.
  const match = title.match(/\b([A-Z]{2,5})\b/);
  return match ? match[1].toLowerCase() : null;
}

export interface MarketIndex {
  // Term -> Set of market IDs
  termIndex: Map<string, Set<string>>;
  // Year -> Set of market IDs  
  yearIndex: Map<string, Set<string>>;
  // Ticker -> Set of market IDs
  tickerIndex: Map<string, Set<string>>;
  // Market ID -> Market
  markets: Map<string, UnifiedMarket>;
  // Market ID -> Pre-computed terms
  marketTerms: Map<string, string[]>;
}

export function createIndex(): MarketIndex {
  return {
    termIndex: new Map(),
    yearIndex: new Map(),
    tickerIndex: new Map(),
    markets: new Map(),
    marketTerms: new Map(),
  };
}

export function addToIndex(index: MarketIndex, market: UnifiedMarket): void {
  const terms = extractTerms(market.title);
  const year = extractYear(market.title);
  const ticker = extractTicker(market.title);
  
  index.markets.set(market.id, market);
  index.marketTerms.set(market.id, terms);
  
  // Index by terms
  for (const term of terms) {
    if (!index.termIndex.has(term)) {
      index.termIndex.set(term, new Set());
    }
    index.termIndex.get(term)!.add(market.id);
  }
  
  // Index by year
  if (year) {
    if (!index.yearIndex.has(year)) {
      index.yearIndex.set(year, new Set());
    }
    index.yearIndex.get(year)!.add(market.id);
  }
  
  // Index by ticker
  if (ticker) {
    if (!index.tickerIndex.has(ticker)) {
      index.tickerIndex.set(ticker, new Set());
    }
    index.tickerIndex.get(ticker)!.add(market.id);
  }
}

export function removeFromIndex(index: MarketIndex, marketId: string): void {
  const terms = index.marketTerms.get(marketId);
  if (terms) {
    for (const term of terms) {
      index.termIndex.get(term)?.delete(marketId);
    }
  }
  index.markets.delete(marketId);
  index.marketTerms.delete(marketId);
}

/**
 * Find candidate markets that might match a given market
 * Returns markets that share at least MIN_SHARED_TERMS terms
 */
export function findCandidates(
  index: MarketIndex,
  market: UnifiedMarket,
  minSharedTerms: number = 2
): UnifiedMarket[] {
  const terms = extractTerms(market.title);
  const year = extractYear(market.title);
  const ticker = extractTicker(market.title);
  
  // Count how many terms each candidate shares
  const candidateCounts = new Map<string, number>();
  
  // Boost candidates that match year or ticker
  const boostedCandidates = new Set<string>();
  
  // Check year matches first (strong signal)
  if (year && index.yearIndex.has(year)) {
    for (const id of index.yearIndex.get(year)!) {
      boostedCandidates.add(id);
    }
  }
  
  // Check ticker matches (strong signal)
  if (ticker && index.tickerIndex.has(ticker)) {
    for (const id of index.tickerIndex.get(ticker)!) {
      boostedCandidates.add(id);
    }
  }
  
  // Count term overlaps
  for (const term of terms) {
    const matchingIds = index.termIndex.get(term);
    if (matchingIds) {
      for (const id of matchingIds) {
        candidateCounts.set(id, (candidateCounts.get(id) || 0) + 1);
      }
    }
  }
  
  // Filter to candidates with enough shared terms or boosted matches
  const candidates: UnifiedMarket[] = [];
  
  for (const [id, count] of candidateCounts) {
    // Accept if enough shared terms OR if year/ticker matched
    if (count >= minSharedTerms || boostedCandidates.has(id)) {
      const candidate = index.markets.get(id);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }
  
  return candidates;
}

/**
 * Build index from array of markets
 */
export function buildIndex(markets: UnifiedMarket[]): MarketIndex {
  const index = createIndex();
  for (const market of markets) {
    addToIndex(index, market);
  }
  return index;
}
