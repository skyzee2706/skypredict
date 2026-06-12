type PersistClaimPayload = {
  txHash: string;
  marketAddress: string;
  userAddress: string;
};

export async function persistClaimedPortfolioPosition(payload: PersistClaimPayload) {
  const response = await fetch('/api/portfolio/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Claim persistence failed: ${response.status}`);
  }
}
