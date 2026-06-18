function toBigIntValue(value) {
  if (typeof value === 'bigint') return value;
  if (value === null || value === undefined) return 0n;
  return BigInt(value);
}

function normalizePosition(position) {
  const raw = Array.isArray(position) ? position : [0n, 0n, 0n, false];
  return {
    sideA: toBigIntValue(raw[0]),
    draw: toBigIntValue(raw.length >= 4 ? raw[1] : 0n),
    sideB: toBigIntValue(raw.length >= 4 ? raw[2] : raw[1]),
    claimed: Boolean(raw[3]),
  };
}

function computeClaimablePayout({ winningPosition, winner, pools }) {
  if (winningPosition <= 0n) return 0n;

  const sideAPool = toBigIntValue(pools?.[0]);
  const drawPool = toBigIntValue(pools?.[1]);
  const sideBPool = toBigIntValue(pools?.[2]);
  const totalPool = sideAPool + drawPool + sideBPool;
  const winningPool = winner === 1 ? drawPool : winner === 2 ? sideBPool : sideAPool;
  if (totalPool <= 0n || winningPool <= 0n) return 0n;

  const grossPayout = (winningPosition * totalPool) / winningPool;
  const fee = (grossPayout * 10n) / 100n;
  return grossPayout - fee;
}

function computePositionAccounting({ position, resolved, winner, pools }) {
  const normalized = normalizePosition(position);
  const total = normalized.sideA + normalized.draw + normalized.sideB;
  if (total <= 0n) return null;

  const winningOutcome = Number(winner || 0);
  const winningPosition = winningOutcome === 1
    ? normalized.draw
    : winningOutcome === 2
      ? normalized.sideB
      : normalized.sideA;
  const payout = resolved
    ? computeClaimablePayout({ winningPosition, winner: winningOutcome, pools })
    : total;

  return {
    ...normalized,
    volume: total,
    payout,
    pnl: payout - total,
    resolved: Boolean(resolved),
    winner: winningOutcome,
  };
}

module.exports = {
  computePositionAccounting,
  normalizePosition,
};
