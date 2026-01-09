/**
 * Sports-specific market matching module
 * Handles team name normalization, bet type detection, and game date parsing
 */

// ===== Team Database =====
// Maps canonical team name to aliases and metadata
interface TeamInfo {
  aliases: string[];
  sport: string;
  city?: string;
  conference?: string;
}

export const SPORTS_TEAMS: Record<string, TeamInfo> = {
  // NFL Teams - AFC
  chiefs: { aliases: ['kansas city chiefs', 'kc chiefs', 'kc', 'kansas city'], sport: 'nfl', city: 'kansas city', conference: 'afc' },
  bills: { aliases: ['buffalo bills', 'buffalo'], sport: 'nfl', city: 'buffalo', conference: 'afc' },
  dolphins: { aliases: ['miami dolphins', 'miami'], sport: 'nfl', city: 'miami', conference: 'afc' },
  patriots: { aliases: ['new england patriots', 'ne patriots', 'pats'], sport: 'nfl', city: 'new england', conference: 'afc' },
  jets: { aliases: ['new york jets', 'ny jets', 'nyj'], sport: 'nfl', city: 'new york', conference: 'afc' },
  ravens: { aliases: ['baltimore ravens', 'baltimore'], sport: 'nfl', city: 'baltimore', conference: 'afc' },
  bengals: { aliases: ['cincinnati bengals', 'cincinnati', 'cincy'], sport: 'nfl', city: 'cincinnati', conference: 'afc' },
  browns: { aliases: ['cleveland browns', 'cleveland'], sport: 'nfl', city: 'cleveland', conference: 'afc' },
  steelers: { aliases: ['pittsburgh steelers', 'pittsburgh'], sport: 'nfl', city: 'pittsburgh', conference: 'afc' },
  texans: { aliases: ['houston texans', 'houston'], sport: 'nfl', city: 'houston', conference: 'afc' },
  colts: { aliases: ['indianapolis colts', 'indy colts', 'indianapolis'], sport: 'nfl', city: 'indianapolis', conference: 'afc' },
  jaguars: { aliases: ['jacksonville jaguars', 'jacksonville', 'jags'], sport: 'nfl', city: 'jacksonville', conference: 'afc' },
  titans: { aliases: ['tennessee titans', 'tennessee'], sport: 'nfl', city: 'tennessee', conference: 'afc' },
  broncos: { aliases: ['denver broncos', 'denver'], sport: 'nfl', city: 'denver', conference: 'afc' },
  chargers: { aliases: ['los angeles chargers', 'la chargers', 'san diego chargers'], sport: 'nfl', city: 'los angeles', conference: 'afc' },
  raiders: { aliases: ['las vegas raiders', 'oakland raiders', 'lv raiders'], sport: 'nfl', city: 'las vegas', conference: 'afc' },
  
  // NFL Teams - NFC
  eagles: { aliases: ['philadelphia eagles', 'philly eagles', 'philly', 'philadelphia'], sport: 'nfl', city: 'philadelphia', conference: 'nfc' },
  cowboys: { aliases: ['dallas cowboys', 'dallas'], sport: 'nfl', city: 'dallas', conference: 'nfc' },
  giants: { aliases: ['new york giants', 'ny giants', 'nyg'], sport: 'nfl', city: 'new york', conference: 'nfc' },
  commanders: { aliases: ['washington commanders', 'washington', 'redskins'], sport: 'nfl', city: 'washington', conference: 'nfc' },
  bears: { aliases: ['chicago bears', 'chicago'], sport: 'nfl', city: 'chicago', conference: 'nfc' },
  lions: { aliases: ['detroit lions', 'detroit'], sport: 'nfl', city: 'detroit', conference: 'nfc' },
  packers: { aliases: ['green bay packers', 'green bay', 'gb packers'], sport: 'nfl', city: 'green bay', conference: 'nfc' },
  vikings: { aliases: ['minnesota vikings', 'minnesota'], sport: 'nfl', city: 'minnesota', conference: 'nfc' },
  falcons: { aliases: ['atlanta falcons', 'atlanta'], sport: 'nfl', city: 'atlanta', conference: 'nfc' },
  panthers: { aliases: ['carolina panthers', 'carolina'], sport: 'nfl', city: 'carolina', conference: 'nfc' },
  saints: { aliases: ['new orleans saints', 'new orleans'], sport: 'nfl', city: 'new orleans', conference: 'nfc' },
  buccaneers: { aliases: ['tampa bay buccaneers', 'tampa bay', 'bucs'], sport: 'nfl', city: 'tampa bay', conference: 'nfc' },
  cardinals: { aliases: ['arizona cardinals', 'arizona'], sport: 'nfl', city: 'arizona', conference: 'nfc' },
  rams: { aliases: ['los angeles rams', 'la rams'], sport: 'nfl', city: 'los angeles', conference: 'nfc' },
  niners: { aliases: ['san francisco 49ers', '49ers', 'sf 49ers', 'san francisco', 'forty niners'], sport: 'nfl', city: 'san francisco', conference: 'nfc' },
  seahawks: { aliases: ['seattle seahawks', 'seattle'], sport: 'nfl', city: 'seattle', conference: 'nfc' },
  
  // NBA Teams - Eastern Conference
  celtics: { aliases: ['boston celtics', 'boston'], sport: 'nba', city: 'boston', conference: 'eastern' },
  nets: { aliases: ['brooklyn nets', 'brooklyn'], sport: 'nba', city: 'brooklyn', conference: 'eastern' },
  knicks: { aliases: ['new york knicks', 'ny knicks'], sport: 'nba', city: 'new york', conference: 'eastern' },
  sixers: { aliases: ['philadelphia 76ers', '76ers', 'philly sixers'], sport: 'nba', city: 'philadelphia', conference: 'eastern' },
  raptors: { aliases: ['toronto raptors', 'toronto'], sport: 'nba', city: 'toronto', conference: 'eastern' },
  bulls: { aliases: ['chicago bulls'], sport: 'nba', city: 'chicago', conference: 'eastern' },
  cavaliers: { aliases: ['cleveland cavaliers', 'cleveland cavs', 'cavs'], sport: 'nba', city: 'cleveland', conference: 'eastern' },
  pistons: { aliases: ['detroit pistons'], sport: 'nba', city: 'detroit', conference: 'eastern' },
  pacers: { aliases: ['indiana pacers', 'indiana'], sport: 'nba', city: 'indiana', conference: 'eastern' },
  bucks: { aliases: ['milwaukee bucks', 'milwaukee'], sport: 'nba', city: 'milwaukee', conference: 'eastern' },
  hawks: { aliases: ['atlanta hawks'], sport: 'nba', city: 'atlanta', conference: 'eastern' },
  hornets: { aliases: ['charlotte hornets', 'charlotte'], sport: 'nba', city: 'charlotte', conference: 'eastern' },
  heat: { aliases: ['miami heat'], sport: 'nba', city: 'miami', conference: 'eastern' },
  magic: { aliases: ['orlando magic', 'orlando'], sport: 'nba', city: 'orlando', conference: 'eastern' },
  wizards: { aliases: ['washington wizards'], sport: 'nba', city: 'washington', conference: 'eastern' },
  
  // NBA Teams - Western Conference
  lakers: { aliases: ['los angeles lakers', 'la lakers'], sport: 'nba', city: 'los angeles', conference: 'western' },
  clippers: { aliases: ['los angeles clippers', 'la clippers'], sport: 'nba', city: 'los angeles', conference: 'western' },
  warriors: { aliases: ['golden state warriors', 'golden state', 'gsw'], sport: 'nba', city: 'golden state', conference: 'western' },
  suns: { aliases: ['phoenix suns', 'phoenix'], sport: 'nba', city: 'phoenix', conference: 'western' },
  kings: { aliases: ['sacramento kings', 'sacramento'], sport: 'nba', city: 'sacramento', conference: 'western' },
  nuggets: { aliases: ['denver nuggets'], sport: 'nba', city: 'denver', conference: 'western' },
  timberwolves: { aliases: ['minnesota timberwolves', 'wolves'], sport: 'nba', city: 'minnesota', conference: 'western' },
  thunder: { aliases: ['oklahoma city thunder', 'okc thunder', 'okc'], sport: 'nba', city: 'oklahoma city', conference: 'western' },
  blazers: { aliases: ['portland trail blazers', 'trail blazers', 'portland'], sport: 'nba', city: 'portland', conference: 'western' },
  jazz: { aliases: ['utah jazz', 'utah'], sport: 'nba', city: 'utah', conference: 'western' },
  mavericks: { aliases: ['dallas mavericks', 'dallas mavs', 'mavs'], sport: 'nba', city: 'dallas', conference: 'western' },
  rockets: { aliases: ['houston rockets'], sport: 'nba', city: 'houston', conference: 'western' },
  grizzlies: { aliases: ['memphis grizzlies', 'memphis'], sport: 'nba', city: 'memphis', conference: 'western' },
  pelicans: { aliases: ['new orleans pelicans'], sport: 'nba', city: 'new orleans', conference: 'western' },
  spurs: { aliases: ['san antonio spurs', 'san antonio'], sport: 'nba', city: 'san antonio', conference: 'western' },
  
  // MLB Teams
  yankees: { aliases: ['new york yankees', 'ny yankees', 'nyy'], sport: 'mlb', city: 'new york' },
  redsox: { aliases: ['boston red sox', 'red sox', 'boston'], sport: 'mlb', city: 'boston' },
  dodgers: { aliases: ['los angeles dodgers', 'la dodgers'], sport: 'mlb', city: 'los angeles' },
  astros: { aliases: ['houston astros'], sport: 'mlb', city: 'houston' },
  braves: { aliases: ['atlanta braves'], sport: 'mlb', city: 'atlanta' },
  cubs: { aliases: ['chicago cubs'], sport: 'mlb', city: 'chicago' },
  whitesox: { aliases: ['chicago white sox', 'white sox'], sport: 'mlb', city: 'chicago' },
  phillies: { aliases: ['philadelphia phillies'], sport: 'mlb', city: 'philadelphia' },
  mets: { aliases: ['new york mets', 'ny mets', 'nym'], sport: 'mlb', city: 'new york' },
  padres: { aliases: ['san diego padres', 'san diego'], sport: 'mlb', city: 'san diego' },
  
  // NHL Teams
  bruins: { aliases: ['boston bruins'], sport: 'nhl', city: 'boston' },
  rangers: { aliases: ['new york rangers', 'ny rangers', 'nyr'], sport: 'nhl', city: 'new york' },
  islanders: { aliases: ['new york islanders', 'ny islanders', 'nyi'], sport: 'nhl', city: 'new york' },
  penguins: { aliases: ['pittsburgh penguins', 'pens'], sport: 'nhl', city: 'pittsburgh' },
  flyers: { aliases: ['philadelphia flyers'], sport: 'nhl', city: 'philadelphia' },
  capitals: { aliases: ['washington capitals', 'caps'], sport: 'nhl', city: 'washington' },
  blackhawks: { aliases: ['chicago blackhawks'], sport: 'nhl', city: 'chicago' },
  redwings: { aliases: ['detroit red wings', 'red wings'], sport: 'nhl', city: 'detroit' },
  leafs: { aliases: ['toronto maple leafs', 'maple leafs'], sport: 'nhl', city: 'toronto' },
  canadiens: { aliases: ['montreal canadiens', 'habs'], sport: 'nhl', city: 'montreal' },
  oilers: { aliases: ['edmonton oilers', 'edmonton'], sport: 'nhl', city: 'edmonton' },
  avalanche: { aliases: ['colorado avalanche', 'avs'], sport: 'nhl', city: 'colorado' },
  lightning: { aliases: ['tampa bay lightning'], sport: 'nhl', city: 'tampa bay' },
  panthers_nhl: { aliases: ['florida panthers'], sport: 'nhl', city: 'florida' },
  
  // Soccer/MLS
  galaxy: { aliases: ['la galaxy', 'los angeles galaxy'], sport: 'mls', city: 'los angeles' },
  lafc: { aliases: ['los angeles fc', 'lafc'], sport: 'mls', city: 'los angeles' },
  sounders: { aliases: ['seattle sounders', 'seattle'], sport: 'mls', city: 'seattle' },
  atlanta_united: { aliases: ['atlanta united', 'atlutd'], sport: 'mls', city: 'atlanta' },
  inter_miami: { aliases: ['inter miami', 'miami cf'], sport: 'mls', city: 'miami' },
};

// Build reverse lookup for team aliases
const TEAM_ALIAS_MAP: Map<string, string> = new Map();
for (const [canonical, info] of Object.entries(SPORTS_TEAMS)) {
  TEAM_ALIAS_MAP.set(canonical, canonical);
  for (const alias of info.aliases) {
    TEAM_ALIAS_MAP.set(alias.toLowerCase(), canonical);
  }
}

// ===== Bet Type Detection =====
export interface SportsBet {
  type: 'moneyline' | 'spread' | 'over_under' | 'prop' | 'futures' | 'winner';
  team?: string;
  line?: number;
  total?: number;
  player?: string;
}

const BET_TYPE_PATTERNS = {
  spread: [
    /([+-]\d+(?:\.\d+)?)\s*(?:spread|pts|points)?/i,
    /(?:spread|line|pts|points)\s*([+-]?\d+(?:\.\d+)?)/i,
    /\b(\w+)\s+([+-]\d+(?:\.\d+)?)\b/i, // "Chiefs +3.5"
  ],
  over_under: [
    /(?:over|under|o\/u|ou)\s*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(?:total|combined|points)/i,
    /total\s*(?:over|under)?\s*(\d+(?:\.\d+)?)/i,
  ],
  moneyline: [
    /\b(?:moneyline|ml|money\s*line|to\s+win)\b/i,
    /\bwin(?:s|ner)?\b(?!.*(?:spread|points|over|under))/i,
  ],
  prop: [
    /(?:passing|rushing|receiving|scoring)\s*(?:yards|touchdowns|tds|points)/i,
    /\b(?:mvp|first\s+(?:td|touchdown|goal|point|score))\b/i,
    /\b(?:assists|rebounds|strikeouts|home\s*runs)\b/i,
  ],
  futures: [
    /\b(?:win|wins?|winner)\s+(?:super bowl|championship|finals|world series|stanley cup|mvp)\b/i,
    /\b(?:super bowl|championship|finals|world series|stanley cup)\s+(?:winner|champion)\b/i,
    /\bto\s+(?:win|make)\s+(?:playoffs|finals|championship)\b/i,
  ],
};

// ===== Sport Detection =====
const SPORT_PATTERNS: Record<string, RegExp[]> = {
  nfl: [/\bnfl\b/i, /\bsuper\s*bowl\b/i, /\bweek\s*\d+\b/i, /\btouchdown/i, /\bquarterback/i],
  nba: [/\bnba\b/i, /\bbasketball\b/i, /\bnba\s*finals/i, /\bwestern\s*conference/i, /\beastern\s*conference/i],
  mlb: [/\bmlb\b/i, /\bbaseball\b/i, /\bworld\s*series\b/i, /\bhome\s*run/i, /\binning/i],
  nhl: [/\bnhl\b/i, /\bhockey\b/i, /\bstanley\s*cup\b/i, /\bgoaltender/i],
  ncaaf: [/\bncaa\s*(?:football|fb)\b/i, /\bcollege\s*football\b/i, /\bcfp\b/i, /\bplayoff\b.*\bfootball/i],
  ncaab: [/\bncaa\s*(?:basketball|bb|hoops)\b/i, /\bmarch\s*madness\b/i, /\bfinal\s*four\b/i],
  mls: [/\bmls\b/i, /\bsoccer\b/i],
  ufc: [/\bufc\b/i, /\bmma\b/i, /\bfight(?:er|ing)?\b/i],
  pga: [/\bpga\b/i, /\bgolf\b/i, /\bmasters\b/i, /\bus\s*open\b.*\bgolf/i],
  tennis: [/\batp\b/i, /\bwta\b/i, /\bwimbledon\b/i, /\btennis\b/i, /\bgrand\s*slam\b/i],
  f1: [/\bf1\b/i, /\bformula\s*(?:1|one)\b/i, /\bgrand\s*prix\b/i],
};

// ===== Major Event Patterns =====
const MAJOR_EVENTS: Record<string, RegExp[]> = {
  super_bowl: [/\bsuper\s*bowl\b/i, /\bsb\s*(?:lv?i{0,3}|[0-9]{1,2})\b/i],
  nba_finals: [/\bnba\s*finals\b/i, /\bnba\s*championship\b/i],
  world_series: [/\bworld\s*series\b/i, /\bmlb\s*championship\b/i],
  stanley_cup: [/\bstanley\s*cup\b/i, /\bnhl\s*finals\b/i],
  march_madness: [/\bmarch\s*madness\b/i, /\bfinal\s*four\b/i, /\bncaa\s*tournament\b/i],
  cfp: [/\bcfp\b/i, /\bcollege\s*football\s*playoff\b/i, /\bnational\s*championship\b.*\bfootball/i],
};

// ===== Date Extraction Patterns =====
const DATE_PATTERNS = [
  // "Jan 15", "January 15", "Jan 15th"
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{1,2})(?:st|nd|rd|th)?\b/i,
  // "1/15", "01/15"
  /\b(\d{1,2})\/(\d{1,2})\b/,
  // "Week 17", "Week 1"
  /\bweek\s*(\d{1,2})\b/i,
  // "Round 1", "Game 3"
  /\b(?:round|game)\s*(\d{1,2})\b/i,
];

// ===== Main Functions =====

/**
 * Extract canonical team name from title
 */
export function extractTeam(title: string): string | null {
  const normalized = title.toLowerCase();
  
  // Try to find team by checking all aliases (longest match first)
  const sortedAliases = [...TEAM_ALIAS_MAP.entries()]
    .sort((a, b) => b[0].length - a[0].length);
  
  for (const [alias, canonical] of sortedAliases) {
    // Word boundary match to avoid partial matches
    const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(normalized)) {
      return canonical;
    }
  }
  
  return null;
}

/**
 * Extract all teams mentioned in a title
 */
export function extractAllTeams(title: string): string[] {
  const normalized = title.toLowerCase();
  const teams: string[] = [];
  const found = new Set<string>();
  
  const sortedAliases = [...TEAM_ALIAS_MAP.entries()]
    .sort((a, b) => b[0].length - a[0].length);
  
  for (const [alias, canonical] of sortedAliases) {
    if (found.has(canonical)) continue;
    
    const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(normalized)) {
      teams.push(canonical);
      found.add(canonical);
    }
  }
  
  return teams;
}

/**
 * Extract sport from title
 */
export function extractSport(title: string): string | null {
  const normalized = title.toLowerCase();
  
  // Check sport patterns
  for (const [sport, patterns] of Object.entries(SPORT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        return sport;
      }
    }
  }
  
  // Infer from team
  const team = extractTeam(title);
  if (team && SPORTS_TEAMS[team]) {
    return SPORTS_TEAMS[team].sport;
  }
  
  return null;
}

/**
 * Extract bet type from title
 */
export function extractBetType(title: string): SportsBet | null {
  const normalized = title.toLowerCase();
  
  // Check spread patterns
  for (const pattern of BET_TYPE_PATTERNS.spread) {
    const match = normalized.match(pattern);
    if (match) {
      const line = parseFloat(match[1]?.replace(/[+]/, '') || match[2]?.replace(/[+]/, ''));
      if (!isNaN(line)) {
        return { type: 'spread', line };
      }
    }
  }
  
  // Check over/under patterns
  for (const pattern of BET_TYPE_PATTERNS.over_under) {
    const match = normalized.match(pattern);
    if (match) {
      const total = parseFloat(match[1]);
      if (!isNaN(total)) {
        return { type: 'over_under', total };
      }
    }
  }
  
  // Check futures patterns
  for (const pattern of BET_TYPE_PATTERNS.futures) {
    if (pattern.test(normalized)) {
      return { type: 'futures' };
    }
  }
  
  // Check prop patterns
  for (const pattern of BET_TYPE_PATTERNS.prop) {
    if (pattern.test(normalized)) {
      return { type: 'prop' };
    }
  }
  
  // Check moneyline patterns
  for (const pattern of BET_TYPE_PATTERNS.moneyline) {
    if (pattern.test(normalized)) {
      return { type: 'moneyline' };
    }
  }
  
  // Default to winner if team is mentioned with "win"
  if (/\b(?:win|wins?|winner|to\s+win)\b/i.test(normalized)) {
    return { type: 'winner' };
  }
  
  return null;
}

/**
 * Extract major event from title
 */
export function extractMajorEvent(title: string): string | null {
  const normalized = title.toLowerCase();
  
  for (const [event, patterns] of Object.entries(MAJOR_EVENTS)) {
    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        return event;
      }
    }
  }
  
  return null;
}

/**
 * Extract game date/week from title
 */
export function extractGameDate(title: string): { type: 'date' | 'week' | 'round' | 'game'; value: string } | null {
  for (const pattern of DATE_PATTERNS) {
    const match = title.match(pattern);
    if (match) {
      if (match[0].toLowerCase().includes('week')) {
        return { type: 'week', value: match[1] };
      } else if (match[0].toLowerCase().includes('round')) {
        return { type: 'round', value: match[1] };
      } else if (match[0].toLowerCase().includes('game')) {
        return { type: 'game', value: match[1] };
      } else {
        return { type: 'date', value: match[0] };
      }
    }
  }
  
  return null;
}

/**
 * Check if a title is sports-related
 */
export function isSportsMarket(title: string): boolean {
  const sport = extractSport(title);
  if (sport) return true;
  
  const team = extractTeam(title);
  if (team) return true;
  
  const event = extractMajorEvent(title);
  if (event) return true;
  
  // Check for sports keywords
  const sportsKeywords = [
    /\b(?:win|wins?|winner|beat|beats|defeat|vs|versus)\b/i,
    /\b(?:game|match|championship|playoff|finals)\b/i,
    /\b(?:score|points|goals|touchdowns?)\b/i,
    /\b(?:spread|moneyline|over|under)\b/i,
  ];
  
  for (const pattern of sportsKeywords) {
    if (pattern.test(title)) {
      // Need additional confirmation
      const hasTeamOrSport = extractTeam(title) || extractSport(title);
      if (hasTeamOrSport) return true;
    }
  }
  
  return false;
}

/**
 * Calculate sports-specific match score
 */
export function calculateSportsMatchScore(titleA: string, titleB: string): number {
  let score = 0;
  let maxScore = 0;
  
  // Team matching (weight: 40%)
  const teamsA = extractAllTeams(titleA);
  const teamsB = extractAllTeams(titleB);
  maxScore += 0.4;
  
  if (teamsA.length > 0 && teamsB.length > 0) {
    const sharedTeams = teamsA.filter(t => teamsB.includes(t));
    if (sharedTeams.length > 0) {
      score += 0.4 * (sharedTeams.length / Math.max(teamsA.length, teamsB.length));
    }
  } else if (teamsA.length === 0 && teamsB.length === 0) {
    // Neither has teams - neutral
    maxScore -= 0.4;
  }
  
  // Sport matching (weight: 15%)
  const sportA = extractSport(titleA);
  const sportB = extractSport(titleB);
  maxScore += 0.15;
  
  if (sportA && sportB) {
    if (sportA === sportB) {
      score += 0.15;
    } else {
      // Different sports - penalty
      return 0;
    }
  }
  
  // Bet type matching (weight: 20%)
  const betA = extractBetType(titleA);
  const betB = extractBetType(titleB);
  maxScore += 0.2;
  
  if (betA && betB) {
    if (betA.type === betB.type) {
      score += 0.15;
      
      // Check line/total compatibility
      if (betA.type === 'spread' && betA.line !== undefined && betB.line !== undefined) {
        // Spreads should be opposite or same
        if (Math.abs(betA.line + betB.line) < 0.5 || Math.abs(betA.line - betB.line) < 0.5) {
          score += 0.05;
        }
      } else if (betA.type === 'over_under' && betA.total !== undefined && betB.total !== undefined) {
        if (Math.abs(betA.total - betB.total) < 1) {
          score += 0.05;
        }
      } else {
        score += 0.05;
      }
    }
  }
  
  // Major event matching (weight: 15%)
  const eventA = extractMajorEvent(titleA);
  const eventB = extractMajorEvent(titleB);
  maxScore += 0.15;
  
  if (eventA && eventB) {
    if (eventA === eventB) {
      score += 0.15;
    } else {
      // Different major events - penalty
      return 0;
    }
  }
  
  // Date/Week matching (weight: 10%)
  const dateA = extractGameDate(titleA);
  const dateB = extractGameDate(titleB);
  maxScore += 0.1;
  
  if (dateA && dateB) {
    if (dateA.type === dateB.type && dateA.value === dateB.value) {
      score += 0.1;
    } else if (dateA.type === dateB.type) {
      // Same type but different value - might be different games
      score -= 0.1;
    }
  }
  
  return maxScore > 0 ? score / maxScore : 0;
}

/**
 * Check if two sports markets are compatible for matching
 */
export function areSportsMarketsCompatible(titleA: string, titleB: string): boolean {
  // Must be same sport
  const sportA = extractSport(titleA);
  const sportB = extractSport(titleB);
  
  if (sportA && sportB && sportA !== sportB) {
    return false;
  }
  
  // If both mention major events, must be the same event
  const eventA = extractMajorEvent(titleA);
  const eventB = extractMajorEvent(titleB);
  
  if (eventA && eventB && eventA !== eventB) {
    return false;
  }
  
  // Check for conflicting bet types
  const betA = extractBetType(titleA);
  const betB = extractBetType(titleB);
  
  if (betA && betB) {
    // Different bet types generally shouldn't match
    // Exception: moneyline and winner are compatible
    const compatible = ['moneyline', 'winner', 'futures'];
    if (betA.type !== betB.type) {
      if (!compatible.includes(betA.type) || !compatible.includes(betB.type)) {
        return false;
      }
    }
    
    // Spreads with opposite signs might be same game, different sides (not a match for arb)
    if (betA.type === 'spread' && betB.type === 'spread') {
      if (betA.line !== undefined && betB.line !== undefined) {
        // If lines are exact opposites, they're different sides of same bet
        if (Math.abs(betA.line + betB.line) < 0.1) {
          return false;
        }
      }
    }
  }
  
  // Check for team conflicts
  const teamsA = extractAllTeams(titleA);
  const teamsB = extractAllTeams(titleB);
  
  if (teamsA.length > 0 && teamsB.length > 0) {
    const sharedTeams = teamsA.filter(t => teamsB.includes(t));
    if (sharedTeams.length === 0) {
      // No shared teams - likely different games
      return false;
    }
  }
  
  // Check for conflicting dates/weeks
  const dateA = extractGameDate(titleA);
  const dateB = extractGameDate(titleB);
  
  if (dateA && dateB) {
    if (dateA.type === dateB.type && dateA.value !== dateB.value) {
      // Same type but different value - different games
      return false;
    }
  }
  
  return true;
}

/**
 * Get team info by canonical name
 */
export function getTeamInfo(canonical: string): TeamInfo | null {
  return SPORTS_TEAMS[canonical] || null;
}
