/**
 * Entity validation for market matching
 * Ensures primary entities (people, orgs, numeric targets) are compatible
 */

// Primary political figures - must match if both markets mention politics
const POLITICAL_FIGURES: Record<string, string[]> = {
  trump: ['trump', 'donald trump', 'donald j trump', 'djt'],
  biden: ['biden', 'joe biden', 'joseph biden'],
  harris: ['harris', 'kamala harris', 'kamala'],
  desantis: ['desantis', 'ron desantis'],
  obama: ['obama', 'barack obama'],
  vance: ['vance', 'jd vance', 'j.d. vance'],
  pence: ['pence', 'mike pence'],
  newsom: ['newsom', 'gavin newsom'],
  haley: ['haley', 'nikki haley'],
  ramaswamy: ['ramaswamy', 'vivek'],
};

// Map aliases to canonical names
const FIGURE_ALIASES: Map<string, string> = new Map();
for (const [canonical, aliases] of Object.entries(POLITICAL_FIGURES)) {
  for (const alias of aliases) {
    FIGURE_ALIASES.set(alias.toLowerCase(), canonical);
  }
}

// Crypto/asset tickers - must match exactly
const CRYPTO_TICKERS = ['btc', 'bitcoin', 'eth', 'ethereum', 'sol', 'solana', 'xrp', 'doge', 'ada'];

// Economic indicators - must match type
const ECONOMIC_INDICATORS: Record<string, string[]> = {
  gdp: ['gdp', 'gross domestic product'],
  inflation: ['inflation', 'cpi', 'consumer price index'],
  unemployment: ['unemployment', 'jobless', 'jobs report'],
  interest_rate: ['interest rate', 'fed rate', 'federal funds rate', 'fomc'],
  pce: ['pce', 'personal consumption'],
};

const INDICATOR_ALIASES: Map<string, string> = new Map();
for (const [canonical, aliases] of Object.entries(ECONOMIC_INDICATORS)) {
  for (const alias of aliases) {
    INDICATOR_ALIASES.set(alias.toLowerCase(), canonical);
  }
}

/**
 * Extract primary political figure from title
 */
function extractPoliticalFigure(title: string): string | null {
  const normalized = title.toLowerCase();
  
  for (const [canonical, aliases] of Object.entries(POLITICAL_FIGURES)) {
    for (const alias of aliases) {
      if (normalized.includes(alias)) {
        return canonical;
      }
    }
  }
  return null;
}

/**
 * Extract crypto/asset ticker from title
 */
function extractCryptoTicker(title: string): string | null {
  const normalized = title.toLowerCase();
  
  for (const ticker of CRYPTO_TICKERS) {
    if (normalized.includes(ticker)) {
      // Normalize bitcoin -> btc, ethereum -> eth, etc.
      if (ticker === 'bitcoin') return 'btc';
      if (ticker === 'ethereum') return 'eth';
      if (ticker === 'solana') return 'sol';
      return ticker;
    }
  }
  return null;
}

/**
 * Extract economic indicator type from title
 */
function extractEconomicIndicator(title: string): string | null {
  const normalized = title.toLowerCase();
  
  for (const [canonical, aliases] of Object.entries(ECONOMIC_INDICATORS)) {
    for (const alias of aliases) {
      if (normalized.includes(alias)) {
        return canonical;
      }
    }
  }
  return null;
}

/**
 * Extract numeric target (price, percentage, threshold)
 * Returns the main numeric target if present
 */
function extractNumericTarget(title: string): { value: number; type: 'price' | 'percent' | 'count' } | null {
  const normalized = title.toLowerCase();
  
  // Price targets: $100k, $100,000, 100k
  const priceMatch = normalized.match(/\$?([\d,]+)k?\b/);
  if (priceMatch) {
    let value = parseFloat(priceMatch[1].replace(/,/g, ''));
    if (normalized.includes('k') && value < 1000) {
      value *= 1000;
    }
    // Only consider as price target if it's a significant number
    if (value >= 1000) {
      return { value, type: 'price' };
    }
  }
  
  // Percentage targets for thresholds (not bracket ranges)
  // Look for standalone percentages like "above 2.5%", "reach 3%"
  const percentMatch = normalized.match(/(?:above|below|reach|hit|exceed)\s*([\d.]+)\s*%/);
  if (percentMatch) {
    return { value: parseFloat(percentMatch[1]), type: 'percent' };
  }
  
  return null;
}

/**
 * Validate that primary entities are compatible
 * Returns false if entities conflict (should NOT match)
 */
export function validatePrimaryEntities(titleA: string, titleB: string): boolean {
  // Check political figures
  const figureA = extractPoliticalFigure(titleA);
  const figureB = extractPoliticalFigure(titleB);
  
  // If both mention political figures, they must be the same
  if (figureA && figureB && figureA !== figureB) {
    return false; // Conflict: different politicians
  }
  
  // Check crypto tickers
  const cryptoA = extractCryptoTicker(titleA);
  const cryptoB = extractCryptoTicker(titleB);
  
  if (cryptoA && cryptoB && cryptoA !== cryptoB) {
    return false; // Conflict: different cryptocurrencies
  }
  
  // Check economic indicators
  const indicatorA = extractEconomicIndicator(titleA);
  const indicatorB = extractEconomicIndicator(titleB);
  
  if (indicatorA && indicatorB && indicatorA !== indicatorB) {
    return false; // Conflict: different economic indicators
  }
  
  return true; // No conflicts detected
}

/**
 * Validate that numeric targets are compatible
 * Returns false if targets conflict significantly
 */
export function validateNumericTargets(titleA: string, titleB: string): boolean {
  const targetA = extractNumericTarget(titleA);
  const targetB = extractNumericTarget(titleB);
  
  // If neither has a target, compatible
  if (!targetA || !targetB) return true;
  
  // If different types, might be different markets
  if (targetA.type !== targetB.type) return true; // Allow - could be related
  
  // Same type - check if values are close enough
  const ratio = Math.max(targetA.value, targetB.value) / Math.min(targetA.value, targetB.value);
  
  // For prices, allow 20% difference (could be same target with slight variations)
  // For percentages, allow 0.5% absolute difference
  if (targetA.type === 'price') {
    return ratio <= 1.2; // Within 20%
  } else if (targetA.type === 'percent') {
    return Math.abs(targetA.value - targetB.value) <= 0.5;
  }
  
  return true;
}

/**
 * Extract year from title
 */
function extractYear(title: string): number | null {
  const match = title.match(/\b(202[4-9]|203[0-9])\b/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Validate that years are compatible
 */
export function validateYears(titleA: string, titleB: string): boolean {
  const yearA = extractYear(titleA);
  const yearB = extractYear(titleB);
  
  // If both have years, they must match
  if (yearA && yearB && yearA !== yearB) {
    return false;
  }
  
  return true;
}

interface BracketRange {
  low: number;
  high: number;
  type: 'range' | 'above' | 'below';
}

/**
 * Extract bracket range from title
 */
function extractBracketRange(title: string): BracketRange | null {
  const normalized = title.toLowerCase();
  
  // Range: "2.1 to 2.5" or "2.0-2.5%"
  const rangeMatch = normalized.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*%?/);
  if (rangeMatch) {
    return {
      low: parseFloat(rangeMatch[1]),
      high: parseFloat(rangeMatch[2]),
      type: 'range',
    };
  }
  
  // Above: "3% or above", ">3%", "over 3%"
  const aboveMatch = normalized.match(/(?:>|over\s+|above\s+|(?:\d+(?:\.\d+)?)\s*%?\s*(?:or\s+)?(?:above|more|higher|\+))/);
  if (aboveMatch) {
    const numMatch = normalized.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:or\s+)?(?:above|more|higher|\+)/);
    if (numMatch) {
      return { low: parseFloat(numMatch[1]), high: Infinity, type: 'above' };
    }
    const gtMatch = normalized.match(/(?:>|over\s+|above\s+)(\d+(?:\.\d+)?)/);
    if (gtMatch) {
      return { low: parseFloat(gtMatch[1]), high: Infinity, type: 'above' };
    }
  }
  
  // Below: "2% or below", "<2%", "under 2%"
  const belowMatch = normalized.match(/(?:<|under\s+|below\s+|(?:\d+(?:\.\d+)?)\s*%?\s*(?:or\s+)?(?:below|less|lower|-))/);
  if (belowMatch) {
    const numMatch = normalized.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:or\s+)?(?:below|less|lower|-)/);
    if (numMatch) {
      return { low: -Infinity, high: parseFloat(numMatch[1]), type: 'below' };
    }
    const ltMatch = normalized.match(/(?:<|under\s+|below\s+)(\d+(?:\.\d+)?)/);
    if (ltMatch) {
      return { low: -Infinity, high: parseFloat(ltMatch[1]), type: 'below' };
    }
  }
  
  return null;
}

/**
 * Check if two bracket ranges are mutually exclusive
 * Returns true if they represent different, non-overlapping outcomes
 */
export function areMutuallyExclusive(titleA: string, titleB: string): boolean {
  const rangeA = extractBracketRange(titleA);
  const rangeB = extractBracketRange(titleB);
  
  // If neither has a range, not exclusive
  if (!rangeA || !rangeB) return false;
  
  // Two distinct ranges that don't overlap are mutually exclusive
  if (rangeA.type === 'range' && rangeB.type === 'range') {
    // Check for adjacent but non-overlapping ranges
    // E.g., [2.0-2.5] and [2.5-3.0]
    const gap = Math.min(
      Math.abs(rangeA.high - rangeB.low),
      Math.abs(rangeB.high - rangeA.low)
    );
    
    // If they touch exactly or have small gap, they're different brackets
    if (gap < 0.1) {
      // Check if they're actually sequential (no overlap)
      if (rangeA.high <= rangeB.low || rangeB.high <= rangeA.low) {
        return true;
      }
    }
    
    // Non-adjacent, non-overlapping ranges are mutually exclusive
    if (rangeA.high < rangeB.low || rangeB.high < rangeA.low) {
      return true;
    }
  }
  
  // Above vs Below with same threshold
  if (rangeA.type === 'above' && rangeB.type === 'below') {
    // "Above 3%" vs "Below 3%" - could be valid if asking opposite questions
    // But this should be caught by semantic conflict check
    return false;
  }
  
  if (rangeA.type === 'below' && rangeB.type === 'above') {
    return false;
  }
  
  return false;
}

/**
 * Combined validation - returns true if markets should potentially match
 */
export function validateMatch(titleA: string, titleB: string): { 
  valid: boolean; 
  reason?: string;
} {
  if (!validatePrimaryEntities(titleA, titleB)) {
    return { valid: false, reason: 'entity_conflict' };
  }
  
  if (!validateNumericTargets(titleA, titleB)) {
    return { valid: false, reason: 'numeric_conflict' };
  }
  
  if (!validateYears(titleA, titleB)) {
    return { valid: false, reason: 'year_conflict' };
  }
  
  if (areMutuallyExclusive(titleA, titleB)) {
    return { valid: false, reason: 'mutually_exclusive' };
  }
  
  return { valid: true };
}
