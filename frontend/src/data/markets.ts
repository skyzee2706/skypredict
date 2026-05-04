// Shared types for markets (aligned to MarketFactory / PredictionMarket contracts)

export type MarketState = 'ACTIVE' | 'RESOLVING' | 'RESOLVED' | 'UNDETERMINED';
export type MarketOutcome = 'YES' | 'NO' | 'DRAW' | string;
export type MarketCategory = 'CRYPTO' | 'STOCKS' | 'SPORTS';

export interface SportLiveScore {
    fixtureId: number;
    league: string;
    status: string;
    elapsed?: number;
    homeGoals?: number;
    awayGoals?: number;
    kickoff: number;
    venue?: string;
}

export interface MarketData {
    id: string;
    contractId: string;
    title: string;
    ticker: string;
    sideAName?: string;
    drawName?: string;
    sideBName?: string;
    description: string;
    type: 'crypto' | 'stock' | 'sport' | 'other';
    category: MarketCategory;
    identifier: string;
    creationDate?: number;
    bettingEndTime?: number;
    strikePrice?: number;
    deadline: number | string;
    deadlineDate?: string;
    resolutionSource: string;
    resolutionRule: string;
    liquidity: number;
    volume: number;
    state: MarketState;
    resolvedOutcome?: MarketOutcome;
    deadlinePrice?: number;
    priceSymbol?: string;
    statsLoading?: boolean;
    probYes: number;
    probDraw?: number;
    probNo: number;
    percentChange: number;
    sport?: SportLiveScore;
}

export interface UserPosition {
    amount: number;
    outcome: 'YES' | 'NO' | 'DRAW' | string;
    claimed?: boolean;
}

export interface UserMarketStatus {
    position?: UserPosition;
    hasPosition: boolean;
    userWon: boolean;
    canClaim: boolean;
    potentialWinnings: number;
}

// Real implementation using on-chain position reads
export async function getUserMarketStatus(contractId: string, walletAddress: string, marketData?: MarketData): Promise<UserMarketStatus | null> {
    try {
        const { getUserBets, calculateUserWinnings } = await import('../lib/onchain/writes');

        if (!contractId || contractId.length !== 42 || !contractId.startsWith('0x')) {
            console.error('Invalid contract address:', contractId);
            return null;
        }

        const userBets = await getUserBets(contractId as `0x${string}`, walletAddress as `0x${string}`);
        const hasPosition = userBets.onSideA > 0 || userBets.onDraw > 0 || userBets.onSideB > 0;

        if (!hasPosition) {
            return {
                hasPosition: false,
                userWon: false,
                canClaim: false,
                potentialWinnings: 0
            };
        }

        const sideAName = marketData?.sideAName || 'YES';
        const drawName = marketData?.drawName || 'DRAW';
        const sideBName = marketData?.sideBName || 'NO';
        const positions = [
            { outcome: sideAName, amount: userBets.onSideA },
            { outcome: drawName, amount: userBets.onDraw },
            { outcome: sideBName, amount: userBets.onSideB }
        ].filter((p) => p.amount > 0);
        const primary = positions.sort((a, b) => b.amount - a.amount)[0];

        const isResolved = marketData ? (marketData.state === 'RESOLVED' || marketData.state === 'UNDETERMINED') : false;
        let userWon = false;
        let potentialWinnings = 0;
        let canClaim = false;

        if (isResolved) {
            const winnings = await calculateUserWinnings(contractId as `0x${string}`, walletAddress as `0x${string}`);
            if (marketData?.state === 'UNDETERMINED') {
                userWon = true;
                potentialWinnings = userBets.onSideA + userBets.onDraw + userBets.onSideB;
                canClaim = true;
            } else if (marketData?.state === 'RESOLVED') {
                const winner = marketData.resolvedOutcome;
                if (winner === sideAName && userBets.onSideA > 0) {
                    userWon = true;
                    potentialWinnings = winnings.ifSideAWins;
                    canClaim = true;
                } else if (winner === drawName && userBets.onDraw > 0) {
                    userWon = true;
                    potentialWinnings = winnings.ifDrawWins;
                    canClaim = true;
                } else if (winner === sideBName && userBets.onSideB > 0) {
                    userWon = true;
                    potentialWinnings = winnings.ifSideBWins;
                    canClaim = true;
                }
            }
        } else {
            const winnings = await calculateUserWinnings(contractId as `0x${string}`, walletAddress as `0x${string}`);
            potentialWinnings = Math.max(winnings.ifSideAWins, winnings.ifDrawWins, winnings.ifSideBWins);
        }

        return {
            position: {
                amount: primary.amount,
                outcome: primary.outcome,
                claimed: userBets.claimed ?? false
            },
            hasPosition: true,
            userWon,
            canClaim,
            potentialWinnings
        };
    } catch (error) {
        console.error('Error fetching user market status:', error);
        return null;
    }
}

export { claimRewards, placeBet } from '../lib/onchain/writes';
