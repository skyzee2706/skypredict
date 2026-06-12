function normalizeMarketTitle(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function marketEventKey(row) {
  return `${String(row.category || 'UNKNOWN').toUpperCase()}|${normalizeMarketTitle(row.title)}|${String(row.deadline || '0')}`;
}

function activeRowVolume(row) {
  const parsed = Number(row.volume || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function factoryIndex(row) {
  const parsed = Number(row._factory_index);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function isFinalRow(row) {
  const state = String(row.state || '').toUpperCase();
  return state === 'RESOLVED' || state === 'UNDETERMINED';
}

function isPreferredActiveRow(candidate, current) {
  const candidateIndex = factoryIndex(candidate);
  const currentIndex = factoryIndex(current);
  if (candidateIndex !== currentIndex) return candidateIndex < currentIndex;

  const candidateVolume = activeRowVolume(candidate);
  const currentVolume = activeRowVolume(current);
  if (candidateVolume !== currentVolume) return candidateVolume > currentVolume;

  return String(candidate.market_address || '').localeCompare(String(current.market_address || '')) < 0;
}

function stripPrivateFields(row) {
  const { _factory_index, ...publicRow } = row;
  return publicRow;
}

function dedupeActiveMarketRows(rows) {
  const byEvent = new Map();
  const eventAddresses = new Map();

  for (const row of rows) {
    const key = marketEventKey(row);
    const addresses = eventAddresses.get(key) || new Set();
    addresses.add(row.market_address);
    eventAddresses.set(key, addresses);

    const existing = byEvent.get(key);
    if (!existing || isPreferredActiveRow(row, existing)) {
      byEvent.set(key, row);
    }
  }

  const upsertRows = [];
  const removableMarkets = new Set();

  for (const [key, canonical] of byEvent.entries()) {
    const addresses = eventAddresses.get(key) || new Set();
    if (isFinalRow(canonical)) {
      for (const address of addresses) removableMarkets.add(address);
      continue;
    }

    upsertRows.push(stripPrivateFields(canonical));
    for (const address of addresses) {
      if (address !== canonical.market_address) removableMarkets.add(address);
    }
  }

  return {
    rows: upsertRows,
    removableMarkets: [...removableMarkets],
  };
}

module.exports = {
  dedupeActiveMarketRows,
  marketEventKey,
  normalizeMarketTitle,
};
