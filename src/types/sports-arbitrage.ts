// Sports Arbitrage Types for Dome Matching Markets API

export type SportType = 'cfb' | 'nfl' | 'nba' | 'mlb' | 'nhl';

export interface SportsMatchedMarket {
  polymarket_market_slug: string;
  polymarket_title: string;
  polymarket_yes_price: number;
  polymarket_no_price: number;
  polymarket_end_time: number;
  kalshi_market_ticker: string;
  kalshi_event_ticker: string;
  kalshi_title: string;
  kalshi_yes_price: number;
  kalshi_no_price: number;
  kalshi_end_time: number;
  match_score: number;
}

export interface SportsMatchingResponse {
  matches: SportsMatchedMarket[];
  sport: SportType;
  timestamp: number;
}

export interface SportsArbitrageOpportunity {
  id: string;
  match: SportsMatchedMarket;
  buyYesOn: 'POLYMARKET' | 'KALSHI';
  buyNoOn: 'POLYMARKET' | 'KALSHI';
  yesPlatformPrice: number;
  noPlatformPrice: number;
  combinedCost: number;
  profitPercent: number;
  profitPerDollar: number;
  expirationDate: Date;
}
