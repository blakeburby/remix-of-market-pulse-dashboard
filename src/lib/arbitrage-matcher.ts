import { UnifiedMarket, CrossPlatformMatch, ArbitrageOpportunity, Platform } from '@/types/dome';
import { MarketIndex, buildIndex, findCandidates, addToIndex, createIndex } from './market-index';
import { validateMatch } from './entity-validator';
import { 
  isSportsMarket, 
  calculateSportsMatchScore, 
  areSportsMarketsCompatible,
  extractSport,
  extractTeam,
  extractBetType,
  extractMajorEvent
} from './sports-matcher';

// ===== Configuration =====
const TIME_WINDOW_DAYS = 3; // Stricter: markets must end within 3 days of each other
const MIN_TITLE_SIMILARITY = 0.45; // Increased: at least 45% term overlap required
const MIN_OVERALL_SCORE = 0.55; // Increased: stronger overall confidence needed
const MIN_SHARED_TERMS_FOR_CANDIDATE = 2; // Increased: at least 2 shared terms
const BASE_EVENT_SIMILARITY_BOOST = 0.25; // Reduced: less aggressive bonus
const BRACKET_MATCH_BOOST = 0.15; // Reduced: less aggressive bracket bonus
const BRACKET_TOLERANCE = 0.25; // Stricter bracket overlap tolerance

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

// Semantic conflict patterns - markets with these conflicting terms should NOT match
const SEMANTIC_CONFLICTS: [RegExp, RegExp][] = [
  [/\bnegative\b/i, /(?<!\bnegative\b.*)\bgrowth\b(?!.*\bnegative\b)/i], // "Negative growth" vs just "growth"
  [/\bunder\b/i, /\bover\b/i],
  [/\bbelow\b/i, /\babove\b/i],
  [/\blose\b/i, /\bwin\b/i],
  [/\bfall\b/i, /\brise\b/i],
  [/\bdecline\b/i, /\bincrease\b/i],
  [/\bdecrease\b/i, /\bincrease\b/i],
  [/\brecession\b/i, /\bexpansion\b/i],
];

// Time period patterns - if present in one title, must match in the other
const TIME_PERIOD_PATTERNS: RegExp[] = [
  /\bq1\b/i, /\bq2\b/i, /\bq3\b/i, /\bq4\b/i,  // Quarters
  /\bh1\b/i, /\bh2\b/i, // Half years
  /\bfirst half\b/i, /\bsecond half\b/i,
  /\bfirst quarter\b/i, /\bsecond quarter\b/i, /\bthird quarter\b/i, /\bfourth quarter\b/i,
];

// Bracket/range patterns for multi-outcome markets
const BRACKET_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*%?/i, // "2.1 to 2.5" or "2.0-2.5%"
  /(\d+(?:\.\d+)?)\s*%?\s*(?:or\s+)?(?:above|more|higher|\+)/i, // "3% or above"
  /(\d+(?:\.\d+)?)\s*%?\s*(?:or\s+)?(?:below|less|lower|-)/i, // "2% or below"
  /[<>]\s*(\d+(?:\.\d+)?)\s*%?/i, // "<2%" or ">3%"
  /(?:under|below)\s+(\d+(?:\.\d+)?)\s*%?/i, // "under 2%"
  /(?:over|above)\s+(\d+(?:\.\d+)?)\s*%?/i, // "over 3%"
];

// Category keywords for topic-based matching
const TOPIC_CATEGORIES: Record<string, string[]> = {
  economic: ['gdp', 'growth', 'inflation', 'unemployment', 'rate', 'economy', 'fed', 'interest', 'recession', 'cpi', 'pce'],
  political: ['election', 'president', 'congress', 'vote', 'senate', 'house', 'governor', 'mayor', 'trump', 'biden'],
  crypto: ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'price', 'token'],
  sports: [
    // Leagues
    'nba', 'nfl', 'mlb', 'nhl', 'mls', 'ncaa', 'pga', 'atp', 'wta', 'ufc', 'f1', 'formula 1',
    // Events  
    'super bowl', 'world series', 'stanley cup', 'finals', 'championship', 
    'playoff', 'playoffs', 'march madness', 'final four', 'bowl game',
    // Bet types
    'moneyline', 'spread', 'over', 'under', 'total', 'cover',
    // Game terms
    'game', 'match', 'vs', 'versus', 'beat', 'defeat',
    // Team sports terms
    'touchdown', 'field goal', 'home run', 'goal', 'assist', 'rebound',
  ],
};

/**
 * Check if two titles have semantic conflicts that mean they're asking opposite questions
 */
function hasSemanticConflict(titleA: string, titleB: string): boolean {
  for (const [patternA, patternB] of SEMANTIC_CONFLICTS) {
    // If one title matches patternA and the other matches patternB, they conflict
    const aMatchesA = patternA.test(titleA);
    const bMatchesB = patternB.test(titleB);
    const aMatchesB = patternB.test(titleA);
    const bMatchesA = patternA.test(titleB);
    
    if ((aMatchesA && bMatchesB && !aMatchesB && !bMatchesA) ||
        (aMatchesB && bMatchesA && !aMatchesA && !bMatchesB)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if time periods in titles are incompatible
 * E.g., "Q4 2025" should not match "full year 2025"
 */
function hasTimePeriodConflict(titleA: string, titleB: string): boolean {
  for (const pattern of TIME_PERIOD_PATTERNS) {
    const aHas = pattern.test(titleA);
    const bHas = pattern.test(titleB);
    
    // If one has a specific time period and the other doesn't, they might be different markets
    if (aHas !== bHas) {
      return true;
    }
  }
  return false;
}

// ===== Bracket/Range Extraction =====

interface BracketRange {
  low: number;
  high: number;
  type: 'range' | 'above' | 'below';
}

/**
 * Extract bracket range from a title (e.g., "2.1 to 2.5" -> {low: 2.1, high: 2.5})
 */
function extractBracketRange(title: string): BracketRange | null {
  const normalized = title.toLowerCase();
  
  // Try range patterns first: "X to Y" or "X-Y%"
  const rangeMatch = normalized.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*%?/);
  if (rangeMatch) {
    return {
      low: parseFloat(rangeMatch[1]),
      high: parseFloat(rangeMatch[2]),
      type: 'range',
    };
  }
  
  // Try "X or above/more/higher"
  const aboveMatch = normalized.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:or\s+)?(?:above|more|higher|\+)/);
  if (aboveMatch) {
    return { low: parseFloat(aboveMatch[1]), high: Infinity, type: 'above' };
  }
  
  // Try ">X" or "over X"
  const gtMatch = normalized.match(/(?:>|over\s+|above\s+)(\d+(?:\.\d+)?)\s*%?/);
  if (gtMatch) {
    return { low: parseFloat(gtMatch[1]), high: Infinity, type: 'above' };
  }
  
  // Try "X or below/less/lower"
  const belowMatch = normalized.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:or\s+)?(?:below|less|lower|-)/);
  if (belowMatch) {
    return { low: -Infinity, high: parseFloat(belowMatch[1]), type: 'below' };
  }
  
  // Try "<X" or "under X"
  const ltMatch = normalized.match(/(?:<|under\s+|below\s+)(\d+(?:\.\d+)?)\s*%?/);
  if (ltMatch) {
    return { low: -Infinity, high: parseFloat(ltMatch[1]), type: 'below' };
  }
  
  return null;
}

/**
 * Check if two bracket ranges overlap (with tolerance)
 */
function areBracketsCompatible(rangeA: BracketRange | null, rangeB: BracketRange | null): boolean {
  // If neither has a bracket, they're compatible (base event matching)
  if (!rangeA && !rangeB) return true;
  
  // If only one has a bracket, they might NOT be the same market
  // One is asking about a specific range, the other about the general outcome
  if (!rangeA || !rangeB) return false;
  
  // Check for overlap with strict tolerance
  const tolerance = BRACKET_TOLERANCE;
  const aLow = rangeA.low === -Infinity ? rangeA.low : rangeA.low - tolerance;
  const aHigh = rangeA.high === Infinity ? rangeA.high : rangeA.high + tolerance;
  const bLow = rangeB.low === -Infinity ? rangeB.low : rangeB.low - tolerance;
  const bHigh = rangeB.high === Infinity ? rangeB.high : rangeB.high + tolerance;
  
  // Ranges overlap if: aLow <= bHigh && bLow <= aHigh
  return aLow <= bHigh && bLow <= aHigh;
}

/**
 * Calculate bracket similarity score
 */
function calculateBracketScore(titleA: string, titleB: string): number {
  const rangeA = extractBracketRange(titleA);
  const rangeB = extractBracketRange(titleB);
  
  // Both have ranges and they overlap well
  if (rangeA && rangeB) {
    if (rangeA.type === 'range' && rangeB.type === 'range') {
      // Calculate overlap percentage
      const overlapLow = Math.max(rangeA.low, rangeB.low);
      const overlapHigh = Math.min(rangeA.high, rangeB.high);
      
      if (overlapLow <= overlapHigh) {
        const overlapSize = overlapHigh - overlapLow;
        const avgRangeSize = ((rangeA.high - rangeA.low) + (rangeB.high - rangeB.low)) / 2;
        if (avgRangeSize > 0) {
          return Math.min(overlapSize / avgRangeSize, 1);
        }
      }
    }
    // Same type bounds match
    if (rangeA.type === rangeB.type) {
      const diff = rangeA.type === 'above' 
        ? Math.abs(rangeA.low - rangeB.low) 
        : Math.abs(rangeA.high - rangeB.high);
      return diff <= 0.5 ? 1 : diff <= 1 ? 0.5 : 0;
    }
  }
  
  // Neither has a range - neutral
  if (!rangeA && !rangeB) return 0;
  
  return 0;
}

// ===== Base Event Extraction =====

/**
 * Extract the base event topic by removing bracket/range information
 * "GDP growth in 2025? 2.1 to 2.5" -> "gdp growth 2025"
 */
function extractBaseEvent(title: string): string {
  return title
    .toLowerCase()
    // Remove bracket ranges
    .replace(/\d+(?:\.\d+)?%?\s*(?:to|-)\s*\d+(?:\.\d+)?%?/g, '')
    // Remove "X or above/below" patterns
    .replace(/\d+(?:\.\d+)?%?\s*(?:or\s+)?(?:above|below|more|less|higher|lower)/gi, '')
    // Remove comparison operators with numbers
    .replace(/[<>]\s*\d+(?:\.\d+)?%?/g, '')
    // Remove "under/over X" patterns
    .replace(/(?:under|over|above|below)\s+\d+(?:\.\d+)?%?/gi, '')
    // Clean up punctuation
    .replace(/[?!.,'"():;\[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate similarity based on base event (ignoring brackets)
 */
function calculateBaseEventScore(titleA: string, titleB: string): number {
  const baseA = extractBaseEvent(titleA);
  const baseB = extractBaseEvent(titleB);
  
  const termsA = baseA.split(' ').filter(t => t.length > 2 && !STOP_WORDS.has(t));
  const termsB = baseB.split(' ').filter(t => t.length > 2 && !STOP_WORDS.has(t));
  
  if (termsA.length === 0 || termsB.length === 0) return 0;
  
  const setA = new Set(termsA);
  const setB = new Set(termsB);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  
  return intersection.size / union.size;
}

/**
 * Get topic category for a market title
 */
function getTopicCategory(title: string): string | null {
  const normalized = title.toLowerCase();
  for (const [category, keywords] of Object.entries(TOPIC_CATEGORIES)) {
    if (keywords.some(kw => normalized.includes(kw))) {
      return category;
    }
  }
  return null;
}

/**
 * Calculate category match score
 */
function calculateCategoryScore(titleA: string, titleB: string): number {
  const catA = getTopicCategory(titleA);
  const catB = getTopicCategory(titleB);
  
  if (catA && catB && catA === catB) return 1;
  return 0;
}

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
    baseEventScore: number;
    bracketScore: number;
    entityScore: number;
    tickerScore: number;
    timeScore: number;
    categoryScore: number;
  };
  reason: string;
}

// Cached index for Kalshi markets - rebuilt when markets change
let cachedKalshiIndex: MarketIndex | null = null;
let cachedKalshiIds: Set<string> = new Set();

function getOrBuildKalshiIndex(kalshiMarkets: UnifiedMarket[]): MarketIndex {
  // Check if we need to rebuild
  const currentIds = new Set(kalshiMarkets.map(m => m.id));
  const needsRebuild = cachedKalshiIndex === null || 
    currentIds.size !== cachedKalshiIds.size ||
    [...currentIds].some(id => !cachedKalshiIds.has(id));
  
  if (needsRebuild) {
    console.log(`[Matcher] Rebuilding Kalshi index with ${kalshiMarkets.length} markets`);
    cachedKalshiIndex = buildIndex(kalshiMarkets);
    cachedKalshiIds = currentIds;
  }
  
  return cachedKalshiIndex!;
}

/**
 * Find matching markets between Polymarket and Kalshi
 * Uses inverted index for O(n) instead of O(n*m) comparisons
 */
export function findMatchingMarkets(
  polymarkets: UnifiedMarket[],
  kalshiMarkets: UnifiedMarket[]
): CrossPlatformMatch[] {
  const matches: CrossPlatformMatch[] = [];
  const usedKalshiIds = new Set<string>();
  
  // Build/get Kalshi index for fast lookups
  const kalshiIndex = getOrBuildKalshiIndex(kalshiMarkets);
  
  // Log total contracts being compared
  const polyContracts = polymarkets.length * 2;
  const kalshiContracts = kalshiMarkets.length * 2;
  console.log(`[Matcher] Comparing ${polymarkets.length} Polymarket markets (${polyContracts} contracts) with ${kalshiMarkets.length} Kalshi markets (${kalshiContracts} contracts)`);

  for (const polymarket of polymarkets) {
    let bestMatch: MatchCandidate | null = null;

    // Pre-compute polymarket features once
    const polyTerms = extractKeyTerms(polymarket.title);
    const polyEntities = extractEntities(polymarket.title);

    // Use index to find candidates instead of checking all Kalshi markets
    const candidates = findCandidates(kalshiIndex, polymarket, MIN_SHARED_TERMS_FOR_CANDIDATE);

    for (const kalshi of candidates) {
      // Skip if already matched
      if (usedKalshiIds.has(kalshi.id)) continue;

      // Skip if no overlapping time window (strict check)
      if (!hasOverlappingTimeWindow(polymarket, kalshi)) continue;

      // Skip if titles have semantic conflicts (asking opposite questions)
      if (hasSemanticConflict(polymarket.title, kalshi.title)) continue;

      // Skip if time periods don't match (e.g., Q4 vs full year)
      if (hasTimePeriodConflict(polymarket.title, kalshi.title)) continue;

      // NEW: Skip if entity validation fails (different politicians, cryptos, etc.)
      const entityValidation = validateMatch(polymarket.title, kalshi.title);
      if (!entityValidation.valid) continue;

      // Check if this is a sports match
      const isSportsMatchCandidate = isSportsMarket(polymarket.title) && isSportsMarket(kalshi.title);
      
      // For sports markets, do additional compatibility check
      if (isSportsMatchCandidate && !areSportsMarketsCompatible(polymarket.title, kalshi.title)) {
        continue;
      }

      // Calculate component scores
      const kalshiTerms = extractKeyTerms(kalshi.title);
      const kalshiEntities = extractEntities(kalshi.title);

      const titleScore = calculateJaccardSimilarity(polyTerms, kalshiTerms);
      const baseEventScore = calculateBaseEventScore(polymarket.title, kalshi.title);
      const bracketScore = calculateBracketScore(polymarket.title, kalshi.title);
      const entityScore = calculateEntityScore(polyEntities, kalshiEntities);
      const tickerScore = calculateTickerScore(polymarket, kalshi);
      const timeScore = calculateTimeScore(polymarket, kalshi);
      const categoryScore = calculateCategoryScore(polymarket.title, kalshi.title);
      
      // NEW: Calculate sports-specific score for sports markets
      const sportsScore = isSportsMatchCandidate 
        ? calculateSportsMatchScore(polymarket.title, kalshi.title) 
        : 0;

      // Use the higher of title score or base event score (for bracket markets)
      let effectiveTitleScore = Math.max(titleScore, baseEventScore);
      
      // For sports markets, also consider sports score
      if (isSportsMatchCandidate && sportsScore > effectiveTitleScore) {
        effectiveTitleScore = sportsScore;
      }

      // STRICTER: Remove category-based bypass, require strong title or ticker match
      // For sports, also allow strong sports score
      if (effectiveTitleScore < MIN_TITLE_SIMILARITY && tickerScore < 0.7 && sportsScore < 0.5) continue;

      // UPDATED WEIGHTS: Title/Base 35%, Entity 25%, Ticker 15%, Time 10%, Category 10%, Bracket 5%
      let overallScore = 
        effectiveTitleScore * 0.35 +
        entityScore * 0.25 +
        tickerScore * 0.15 +
        timeScore * 0.10 +
        categoryScore * 0.10 +
        bracketScore * 0.05;
      
      // Sports match bonus
      if (isSportsMatchCandidate && sportsScore >= 0.6) {
        overallScore += 0.15; // Significant bonus for strong sports matches
      }

      // REDUCED bonuses
      if (baseEventScore >= 0.75) {
        overallScore += BASE_EVENT_SIMILARITY_BOOST * 0.25;
      }
      
      if (bracketScore >= 0.7) {
        overallScore += BRACKET_MATCH_BOOST * 0.25;
      }

      if (overallScore >= MIN_OVERALL_SCORE && (!bestMatch || overallScore > bestMatch.score)) {
        const reasons: string[] = [];
        
        // Add sports-specific reason
        if (isSportsMatchCandidate && sportsScore >= 0.5) {
          const sport = extractSport(polymarket.title) || extractSport(kalshi.title);
          const team = extractTeam(polymarket.title) || extractTeam(kalshi.title);
          const betType = extractBetType(polymarket.title) || extractBetType(kalshi.title);
          const event = extractMajorEvent(polymarket.title) || extractMajorEvent(kalshi.title);
          
          if (event) reasons.push(event.replace('_', ' '));
          else if (sport) reasons.push(sport.toUpperCase());
          if (team) reasons.push(team);
          if (betType) reasons.push(betType.type);
        } else {
          if (baseEventScore >= 0.6) reasons.push(`base event ${Math.round(baseEventScore * 100)}%`);
          else if (titleScore >= 0.4) reasons.push(`title ${Math.round(titleScore * 100)}%`);
        }
        
        if (bracketScore >= 0.5) reasons.push(`bracket match`);
        if (entityScore >= 0.3) reasons.push(`entities ${Math.round(entityScore * 100)}%`);
        if (tickerScore >= 0.5) reasons.push(`ticker match`);
        if (categoryScore >= 1) reasons.push(`same category`);
        if (timeScore >= 0.8) reasons.push(`same timeframe`);

        bestMatch = {
          kalshi,
          score: Math.min(overallScore, 1),
          breakdown: { titleScore, baseEventScore, bracketScore, entityScore, tickerScore, timeScore, categoryScore },
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

  // Log matching results
  const matchedContracts = matches.length * 4; // 2 contracts per market * 2 platforms
  console.log(`[Matcher] Found ${matches.length} matched pairs (${matchedContracts} contracts in matched markets)`);
  
  // Sort by match score descending
  return matches.sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Incremental matching - find matches for new markets without full recomputation
 */
export function findMatchesForNewMarkets(
  newPolymarkets: UnifiedMarket[],
  kalshiIndex: MarketIndex,
  existingMatches: CrossPlatformMatch[]
): CrossPlatformMatch[] {
  const usedKalshiIds = new Set(existingMatches.map(m => m.kalshi.id));
  const newMatches: CrossPlatformMatch[] = [];
  
  for (const polymarket of newPolymarkets) {
    let bestMatch: MatchCandidate | null = null;
    const polyTerms = extractKeyTerms(polymarket.title);
    const polyEntities = extractEntities(polymarket.title);
    
    const candidates = findCandidates(kalshiIndex, polymarket, MIN_SHARED_TERMS_FOR_CANDIDATE);
    
    for (const kalshi of candidates) {
      if (usedKalshiIds.has(kalshi.id)) continue;
      if (!hasOverlappingTimeWindow(polymarket, kalshi)) continue;
      
      // Skip if titles have semantic conflicts (asking opposite questions)
      if (hasSemanticConflict(polymarket.title, kalshi.title)) continue;
      
      // Skip if time periods don't match (e.g., Q4 vs full year)
      if (hasTimePeriodConflict(polymarket.title, kalshi.title)) continue;
      
      // NEW: Skip if entity validation fails
      const entityValidation = validateMatch(polymarket.title, kalshi.title);
      if (!entityValidation.valid) continue;
      
      const kalshiTerms = extractKeyTerms(kalshi.title);
      const kalshiEntities = extractEntities(kalshi.title);
      
      const titleScore = calculateJaccardSimilarity(polyTerms, kalshiTerms);
      const baseEventScore = calculateBaseEventScore(polymarket.title, kalshi.title);
      const bracketScore = calculateBracketScore(polymarket.title, kalshi.title);
      const entityScore = calculateEntityScore(polyEntities, kalshiEntities);
      const tickerScore = calculateTickerScore(polymarket, kalshi);
      const timeScore = calculateTimeScore(polymarket, kalshi);
      const categoryScore = calculateCategoryScore(polymarket.title, kalshi.title);
      
      const effectiveTitleScore = Math.max(titleScore, baseEventScore);
      
      // STRICTER: Require strong title or ticker match
      if (effectiveTitleScore < MIN_TITLE_SIMILARITY && tickerScore < 0.7) continue;
      
      // UPDATED WEIGHTS
      let overallScore = 
        effectiveTitleScore * 0.35 +
        entityScore * 0.25 +
        tickerScore * 0.15 +
        timeScore * 0.10 +
        categoryScore * 0.10 +
        bracketScore * 0.05;
      
      if (baseEventScore >= 0.75) overallScore += BASE_EVENT_SIMILARITY_BOOST * 0.25;
      if (bracketScore >= 0.7) overallScore += BRACKET_MATCH_BOOST * 0.25;
      
      if (overallScore >= MIN_OVERALL_SCORE && (!bestMatch || overallScore > bestMatch.score)) {
        bestMatch = {
          kalshi,
          score: Math.min(overallScore, 1),
          breakdown: { titleScore, baseEventScore, bracketScore, entityScore, tickerScore, timeScore, categoryScore },
          reason: `score ${Math.round(overallScore * 100)}%`,
        };
      }
    }
    
    if (bestMatch) {
      usedKalshiIds.add(bestMatch.kalshi.id);
      newMatches.push({
        polymarket,
        kalshi: bestMatch.kalshi,
        matchScore: bestMatch.score,
        matchReason: bestMatch.reason,
      });
    }
  }
  
  return newMatches;
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

    // Get prices - handle nullable types
    const polyYes = polymarket.sideA.probability;
    const polyNo = polymarket.sideB.probability;
    const kalshiYes = kalshi.sideA.probability;
    const kalshiNo = kalshi.sideB.probability;

    // Skip if any prices are null or 0 (not yet fetched or no trades)
    if (polyYes === null || polyNo === null || kalshiYes === null || kalshiNo === null) continue;
    if (polyYes === 0 || polyNo === 0 || kalshiYes === 0 || kalshiNo === 0) continue;

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
