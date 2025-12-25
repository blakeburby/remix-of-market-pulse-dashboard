import { UnifiedMarket, CrossPlatformMatch, ArbitrageOpportunity, Platform } from '@/types/dome';

// ===== Configuration =====
const TIME_WINDOW_DAYS = 3; // Stricter: markets must end within 3 days of each other
const MIN_TITLE_SIMILARITY = 0.35;
const MIN_OVERALL_SCORE = 0.5;

// ===== Entity Patterns =====
const ENTITY_PATTERNS = {
  // Named entities - people, organizations
  names: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
  // Dates and years
  dates: /\b(20\d{2}|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi,
  // Numbers with context (percentages, prices, etc.)
  numbers: /\b(\d+(?:\.\d+)?%?)\b/g,
  // Tickers and codes (all caps 2-6 chars)
  tickers: /\b([A-Z]{2,6})\b/g,
};

// Common words to exclude from matching
const STOP_WORDS = new Set([
  'will', 'the', 'a', 'an', 'in', 'on', 'at', 'by', 'for', 'to', 'of', 'be',
  'is', 'are', 'was', 'were', 'do', 'does', 'did', 'have', 'has', 'had',
  'yes', 'no', 'or', 'and', 'but', 'if', 'then', 'than', 'this', 'that',
  'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
  'before', 'after', 'during', 'between', 'above', 'below',
]);

// ===== Title Normalization =====

/**
 * Normalize a market title for matching
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[?!.,'"():;\[\]{}]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract key terms from a title, excluding stop words
 */
export function extractKeyTerms(title: string): string[] {
  const normalized = normalizeTitle(title);
  return normalized
    .split(' ')
    .filter(term => term.length > 2 && !STOP_WORDS.has(term));
}

/**
 * Extract named entities (names, dates, numbers, tickers)
 */
export function extractEntities(title: string): {
  names: string[];
  dates: string[];
  numbers: string[];
  tickers: string[];
} {
  const entities = {
    names: [] as string[],
    dates: [] as string[],
    numbers: [] as string[],
    tickers: [] as string[],
  };

  // Extract names (sequences of capitalized words)
  const nameMatches = title.match(ENTITY_PATTERNS.names) || [];
  entities.names = nameMatches.map(n => n.toLowerCase());

  // Extract dates/years
  const dateMatches = title.match(ENTITY_PATTERNS.dates) || [];
  entities.dates = dateMatches.map(d => d.toLowerCase());

  // Extract numbers
  const numMatches = title.match(ENTITY_PATTERNS.numbers) || [];
  entities.numbers = numMatches;

  // Extract tickers
  const tickerMatches = title.match(ENTITY_PATTERNS.tickers) || [];
  entities.tickers = tickerMatches.filter(t => t.length >= 2);

  return entities;
}

// ===== Similarity Calculations =====

/**
 * Calculate Jaccard similarity between two sets
 */
export function calculateJaccardSimilarity(termsA: string[], termsB: string[]): number {
  const setA = new Set(termsA);
  const setB = new Set(termsB);

  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Calculate entity overlap score (0-1)
 * Weighted: names > tickers > dates > numbers
 */
function calculateEntityScore(entitiesA: ReturnType<typeof extractEntities>, entitiesB: ReturnType<typeof extractEntities>): number {
  let score = 0;
  let weight = 0;

  // Names are most important (weight 3)
  if (entitiesA.names.length > 0 && entitiesB.names.length > 0) {
    const overlap = entitiesA.names.filter(n => entitiesB.names.some(m => m.includes(n) || n.includes(m)));
    if (overlap.length > 0) {
      score += 3 * (overlap.length / Math.max(entitiesA.names.length, entitiesB.names.length));
    }
    weight += 3;
  }

  // Tickers (weight 2)
  if (entitiesA.tickers.length > 0 && entitiesB.tickers.length > 0) {
    const overlap = entitiesA.tickers.filter(t => entitiesB.tickers.includes(t));
    if (overlap.length > 0) {
      score += 2 * (overlap.length / Math.max(entitiesA.tickers.length, entitiesB.tickers.length));
    }
    weight += 2;
  }

  // Dates/years (weight 2)
  if (entitiesA.dates.length > 0 && entitiesB.dates.length > 0) {
    const overlap = entitiesA.dates.filter(d => entitiesB.dates.includes(d));
    if (overlap.length > 0) {
      score += 2 * (overlap.length / Math.max(entitiesA.dates.length, entitiesB.dates.length));
    }
    weight += 2;
  }

  // Numbers (weight 1)
  if (entitiesA.numbers.length > 0 && entitiesB.numbers.length > 0) {
    const overlap = entitiesA.numbers.filter(n => entitiesB.numbers.includes(n));
    if (overlap.length > 0) {
      score += 1 * (overlap.length / Math.max(entitiesA.numbers.length, entitiesB.numbers.length));
    }
    weight += 1;
  }

  return weight > 0 ? score / weight : 0;
}

/**
 * Calculate title similarity between two market titles
 */
export function calculateTitleSimilarity(titleA: string, titleB: string): number {
  const termsA = extractKeyTerms(titleA);
  const termsB = extractKeyTerms(titleB);
  return calculateJaccardSimilarity(termsA, termsB);
}

// ===== Time Window Matching =====

/**
 * Check if two markets have overlapping time windows
 * Stricter: must end within TIME_WINDOW_DAYS of each other
 */
export function hasOverlappingTimeWindow(marketA: UnifiedMarket, marketB: UnifiedMarket): boolean {
  const daysDiff = Math.abs(marketA.endTime.getTime() - marketB.endTime.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff <= TIME_WINDOW_DAYS;
}

/**
 * Calculate time proximity score (1 = same day, 0 = at threshold)
 */
function calculateTimeScore(marketA: UnifiedMarket, marketB: UnifiedMarket): number {
  const daysDiff = Math.abs(marketA.endTime.getTime() - marketB.endTime.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff > TIME_WINDOW_DAYS) return 0;
  return 1 - (daysDiff / TIME_WINDOW_DAYS);
}

// ===== Ticker Matching =====

/**
 * Normalize a ticker/slug for comparison
 */
function normalizeTicker(ticker: string): string {
  return ticker
    .toLowerCase()
    .replace(/[-_]/g, '') // Remove separators
    .replace(/[^a-z0-9]/g, ''); // Keep only alphanumeric
}

/**
 * Check if tickers/slugs match or are similar
 */
function calculateTickerScore(polymarket: UnifiedMarket, kalshi: UnifiedMarket): number {
  // Get available identifiers
  const polySlug = polymarket.eventSlug || polymarket.marketSlug || '';
  const kalshiTicker = kalshi.kalshiEventTicker || '';

  if (!polySlug || !kalshiTicker) return 0;

  const normPoly = normalizeTicker(polySlug);
  const normKalshi = normalizeTicker(kalshiTicker);

  // Exact match
  if (normPoly === normKalshi) return 1;

  // One contains the other
  if (normPoly.includes(normKalshi) || normKalshi.includes(normPoly)) {
    return 0.8;
  }

  // Check if significant overlap (at least 60% of shorter string)
  const shorter = normPoly.length < normKalshi.length ? normPoly : normKalshi;
  const longer = normPoly.length >= normKalshi.length ? normPoly : normKalshi;
  
  // Simple substring matching
  let maxOverlap = 0;
  for (let i = 0; i <= longer.length - 3; i++) {
    for (let len = 3; len <= Math.min(shorter.length, longer.length - i); len++) {
      const sub = longer.substring(i, i + len);
      if (shorter.includes(sub) && sub.length > maxOverlap) {
        maxOverlap = sub.length;
      }
    }
  }

  if (maxOverlap >= shorter.length * 0.6) {
    return 0.5 * (maxOverlap / shorter.length);
  }

  return 0;
}

// ===== Main Matching Logic =====

interface MatchCandidate {
  kalshi: UnifiedMarket;
  score: number;
  breakdown: {
    titleScore: number;
    entityScore: number;
    tickerScore: number;
    timeScore: number;
  };
  reason: string;
}

/**
 * Find matching markets between Polymarket and Kalshi
 */
export function findMatchingMarkets(
  polymarkets: UnifiedMarket[],
  kalshiMarkets: UnifiedMarket[]
): CrossPlatformMatch[] {
  const matches: CrossPlatformMatch[] = [];
  const usedKalshiIds = new Set<string>();

  for (const polymarket of polymarkets) {
    let bestMatch: MatchCandidate | null = null;

    // Pre-compute polymarket features
    const polyTerms = extractKeyTerms(polymarket.title);
    const polyEntities = extractEntities(polymarket.title);

    for (const kalshi of kalshiMarkets) {
      // Skip if already matched
      if (usedKalshiIds.has(kalshi.id)) continue;

      // Skip if no overlapping time window (strict check)
      if (!hasOverlappingTimeWindow(polymarket, kalshi)) continue;

      // Calculate component scores
      const kalshiTerms = extractKeyTerms(kalshi.title);
      const kalshiEntities = extractEntities(kalshi.title);

      const titleScore = calculateJaccardSimilarity(polyTerms, kalshiTerms);
      const entityScore = calculateEntityScore(polyEntities, kalshiEntities);
      const tickerScore = calculateTickerScore(polymarket, kalshi);
      const timeScore = calculateTimeScore(polymarket, kalshi);

      // Skip if title similarity is too low (unless ticker matches)
      if (titleScore < MIN_TITLE_SIMILARITY && tickerScore < 0.5) continue;

      // Calculate weighted overall score
      // Weights: Title 40%, Entities 30%, Ticker 20%, Time 10%
      const overallScore = 
        titleScore * 0.4 +
        entityScore * 0.3 +
        tickerScore * 0.2 +
        timeScore * 0.1;

      if (overallScore >= MIN_OVERALL_SCORE && (!bestMatch || overallScore > bestMatch.score)) {
        const reasons: string[] = [];
        if (titleScore >= 0.4) reasons.push(`title ${Math.round(titleScore * 100)}%`);
        if (entityScore >= 0.3) reasons.push(`entities ${Math.round(entityScore * 100)}%`);
        if (tickerScore >= 0.5) reasons.push(`ticker match`);
        if (timeScore >= 0.8) reasons.push(`same timeframe`);

        bestMatch = {
          kalshi,
          score: Math.min(overallScore, 1),
          breakdown: { titleScore, entityScore, tickerScore, timeScore },
          reason: reasons.length > 0 ? reasons.join(' + ') : `score ${Math.round(overallScore * 100)}%`,
        };
      }
    }

    if (bestMatch) {
      usedKalshiIds.add(bestMatch.kalshi.id);
      matches.push({
        polymarket,
        kalshi: bestMatch.kalshi,
        matchScore: bestMatch.score,
        matchReason: bestMatch.reason,
      });
    }
  }

  // Sort by match score descending
  return matches.sort((a, b) => b.matchScore - a.matchScore);
}

// ===== Arbitrage Detection =====

/**
 * Find arbitrage opportunities from matched markets
 */
export function findArbitrageOpportunities(
  matches: CrossPlatformMatch[]
): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];

  for (const match of matches) {
    const { polymarket, kalshi } = match;

    // Get prices
    const polyYes = polymarket.sideA.probability;
    const polyNo = polymarket.sideB.probability;
    const kalshiYes = kalshi.sideA.probability;
    const kalshiNo = kalshi.sideB.probability;

    // Skip if any prices are 0
    if (!polyYes || !polyNo || !kalshiYes || !kalshiNo) continue;

    // Direction 1: Buy YES on Kalshi + Buy NO on Polymarket
    const cost1 = kalshiYes + polyNo;
    if (cost1 < 1) {
      const profit1 = 1 - cost1;
      opportunities.push({
        id: `arb-${match.polymarket.id}-${match.kalshi.id}-d1`,
        match,
        type: 'locked',
        buyYesOn: 'KALSHI',
        buyNoOn: 'POLYMARKET',
        yesPlatformPrice: kalshiYes,
        noPlatformPrice: polyNo,
        combinedCost: cost1,
        guaranteedPayout: 1,
        profitPercent: (profit1 / cost1) * 100,
        profitPerDollar: profit1,
        expirationDate: polymarket.endTime < kalshi.endTime ? polymarket.endTime : kalshi.endTime,
        lastUpdated: new Date(),
      });
    }

    // Direction 2: Buy YES on Polymarket + Buy NO on Kalshi
    const cost2 = polyYes + kalshiNo;
    if (cost2 < 1) {
      const profit2 = 1 - cost2;
      opportunities.push({
        id: `arb-${match.polymarket.id}-${match.kalshi.id}-d2`,
        match,
        type: 'locked',
        buyYesOn: 'POLYMARKET',
        buyNoOn: 'KALSHI',
        yesPlatformPrice: polyYes,
        noPlatformPrice: kalshiNo,
        combinedCost: cost2,
        guaranteedPayout: 1,
        profitPercent: (profit2 / cost2) * 100,
        profitPerDollar: profit2,
        expirationDate: polymarket.endTime < kalshi.endTime ? polymarket.endTime : kalshi.endTime,
        lastUpdated: new Date(),
      });
    }
  }

  // Sort by profit percentage descending
  return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
}

// ===== Formatting Helpers =====

export function formatCents(price: number): string {
  return `${Math.round(price * 100)}¢`;
}

export function formatProfitPercent(percent: number): string {
  return `+${percent.toFixed(2)}%`;
}
