import type { MarketData, MarketState } from '../../data/markets';

export type ActiveMarketRow = Record<string, unknown>;

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function stateValue(value: unknown): MarketState {
  const raw = String(value || 'ACTIVE').toUpperCase();
  if (raw === 'RESOLVED' || raw === 'RESOLVING' || raw === 'UNDETERMINED') return raw;
  return 'ACTIVE';
}

export function rowToMarketData(row: ActiveMarketRow): MarketData {
  const address = stringValue(row.market_address ?? row.id ?? row.contractId).toLowerCase();
  const category = stringValue(row.category, 'CRYPTO') as MarketData['category'];
  const type = stringValue(row.market_type ?? row.type, category === 'SPORTS' ? 'sport' : category === 'POLITICS' ? 'politics' : 'crypto') as MarketData['type'];
  const deadline = numberValue(row.deadline);
  const bettingEndTime = numberValue(row.betting_end_time ?? row.bettingEndTime);
  const sideAName = stringValue(row.side_a_name ?? row.sideAName, 'YES');
  const drawName = stringValue(row.draw_name ?? row.drawName, 'Draw');
  const sideBName = stringValue(row.side_b_name ?? row.sideBName, 'NO');

  return {
    id: address,
    contractId: address,
    title: stringValue(row.title, 'Untitled market'),
    ticker: stringValue(row.ticker, category === 'SPORTS' ? 'SPORT' : category === 'POLITICS' ? 'POLITICS' : 'BTC'),
    sideAName,
    drawName,
    sideBName,
    description: stringValue(row.description, category === 'SPORTS' ? 'Football match — market closes at kickoff.' : 'Resolves via on-chain settlement.'),
    type,
    category,
    identifier: stringValue(row.identifier, address),
    creationDate: numberValue(row.creation_date ?? row.creationDate),
    deadline,
    deadlineDate: deadline > 0 ? new Date(deadline * 1000).toISOString() : undefined,
    bettingEndTime,
    strikePrice: row.strike_price === null || row.strike_price === undefined ? undefined : numberValue(row.strike_price),
    resolutionSource: stringValue(row.resolution_source ?? row.resolutionSource, category === 'SPORTS' ? 'Live score API' : 'Median 10 exchanges'),
    resolutionRule: stringValue(row.resolution_rule ?? row.resolutionRule, `${sideAName} wins based on settlement result.`),
    liquidity: numberValue(row.liquidity ?? row.volume),
    volume: numberValue(row.volume ?? row.liquidity),
    state: stateValue(row.state),
    resolvedOutcome: row.resolved_outcome ? stringValue(row.resolved_outcome) : undefined,
    deadlinePrice: row.deadline_price === null || row.deadline_price === undefined ? undefined : numberValue(row.deadline_price),
    priceSymbol: stringValue(row.price_symbol ?? row.priceSymbol, category === 'CRYPTO' ? '$' : ''),
    probYes: numberValue(row.prob_yes ?? row.probYes, 0.5),
    probDraw: numberValue(row.prob_draw ?? row.probDraw, category === 'CRYPTO' ? 0 : 0.2),
    probNo: numberValue(row.prob_no ?? row.probNo, 0.5),
    percentChange: numberValue(row.percent_change ?? row.percentChange),
    statsLoading: false,
  };
}
