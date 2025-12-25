import { UnifiedMarket, CrossPlatformMatch, ArbitrageOpportunity, Platform } from '@/types/dome';

/**
 * Normalize a market title for matching
 * Removes common words, punctuation, and normalizes case
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[?!.,'"]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/\b(will|the|a|an|in|on|at|by|for|to|of|be|is|are|was|were)\b/gi, '') // Remove common words
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract key terms from a title for matching
 */
export function extractKeyTerms(title: string): string[] {
  const normalized = normalizeTitle(title);
  return normalized.split(' ').filter(term => term.length > 2);
}

/**
 * Calculate Jaccard similarity between two sets of terms
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
 * Calculate title similarity between two market titles
 * Returns a score from 0 to 1
 */
export function calculateTitleSimilarity(titleA: string, titleB: string): number {
  const termsA = extractKeyTerms(titleA);
  const termsB = extractKeyTerms(titleB);
  
  return calculateJaccardSimilarity(termsA, termsB);
}

/**
 * Check if two markets have overlapping time windows
 */
export function hasOverlappingTimeWindow(marketA: UnifiedMarket, marketB: UnifiedMarket): boolean {
  // Check if end dates are within 7 days of each other
  const daysDiff = Math.abs(marketA.endTime.getTime() - marketB.endTime.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff <= 7;
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
    let bestMatch: { kalshi: UnifiedMarket; score: number; reason: string } | null = null;
    
    for (const kalshi of kalshiMarkets) {
      // Skip if already matched
      if (usedKalshiIds.has(kalshi.id)) continue;
      
      // Skip if no overlapping time window
      if (!hasOverlappingTimeWindow(polymarket, kalshi)) continue;
      
      // Calculate title similarity
      const titleSimilarity = calculateTitleSimilarity(polymarket.title, kalshi.title);
      
      // Skip if too low similarity
      if (titleSimilarity < 0.3) continue;
      
      // Bonus for exact keyword matches
      const polyTerms = extractKeyTerms(polymarket.title);
      const kalshiTerms = extractKeyTerms(kalshi.title);
      
      // Check for specific entity matches (names, numbers, dates)
      const entityMatch = polyTerms.some(term => {
        // Match numbers, years, proper nouns
        if (/\d+/.test(term) || /^[A-Z]/.test(term)) {
          return kalshiTerms.includes(term);
        }
        return false;
      });
      
      const score = titleSimilarity + (entityMatch ? 0.2 : 0);
      
      if (score >= 0.4 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = {
          kalshi,
          score: Math.min(score, 1),
          reason: `Title similarity: ${(titleSimilarity * 100).toFixed(0)}%${entityMatch ? ' + entity match' : ''}`
        };
      }
    }
    
    if (bestMatch) {
      usedKalshiIds.add(bestMatch.kalshi.id);
      matches.push({
        polymarket,
        kalshi: bestMatch.kalshi,
        matchScore: bestMatch.score,
        matchReason: bestMatch.reason
      });
    }
  }
  
  return matches;
}

/**
 * Find arbitrage opportunities from matched markets
 * Checks both directions: Kalshi YES + Polymarket NO and vice versa
 */
export function findArbitrageOpportunities(
  matches: CrossPlatformMatch[]
): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];
  
  for (const match of matches) {
    const { polymarket, kalshi } = match;
    
    // Get prices (already in 0-1 format from probability)
    const polyYes = polymarket.sideA.probability;
    const polyNo = polymarket.sideB.probability;
    const kalshiYes = kalshi.sideA.probability;
    const kalshiNo = kalshi.sideB.probability;
    
    // Skip if any prices are 0 (no data)
    if (!polyYes || !polyNo || !kalshiYes || !kalshiNo) continue;
    
    // Check Direction 1: Buy YES on Kalshi + Buy NO on Polymarket
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
        lastUpdated: new Date()
      });
    }
    
    // Check Direction 2: Buy YES on Polymarket + Buy NO on Kalshi
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
        lastUpdated: new Date()
      });
    }
  }
  
  // Sort by profit percentage descending
  return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
}

/**
 * Format price as cents (e.g., 0.45 -> "45¢")
 */
export function formatCents(price: number): string {
  return `${Math.round(price * 100)}¢`;
}

/**
 * Format profit percentage
 */
export function formatProfitPercent(percent: number): string {
  return `+${percent.toFixed(2)}%`;
}
