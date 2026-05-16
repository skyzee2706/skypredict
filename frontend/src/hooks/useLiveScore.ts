import { useState, useEffect } from 'react';

export interface SportLiveScore {
    homeTeam: string;
    awayTeam: string;
    homeGoals: number | null;
    awayGoals: number | null;
    status: string;
    elapsed: string | null;
    utcDate: string;
}

interface FootballTeam {
    name?: string;
    shortName?: string;
}

interface FootballMatch {
    homeTeam?: FootballTeam;
    awayTeam?: FootballTeam;
    score?: {
        fullTime?: {
            home?: number | null;
            away?: number | null;
        };
    };
    status: string;
    utcDate: string;
}

const normalizeTeamName = (name: string) =>
    name
        .toLowerCase()
        .replace(/\b(fc|cf|afc|sc|club|the)\b/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const teamMatches = (expected: string, actual: string) => {
    const a = normalizeTeamName(expected);
    const b = normalizeTeamName(actual);
    return Boolean(a && b && (a.includes(b) || b.includes(a)));
};

const toDateOnly = (input?: string | number) => {
    if (!input) return null;
    const date = typeof input === 'number' ? new Date(input * 1000) : new Date(input);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
};

const getElapsedMinutes = (match: FootballMatch): string | null => {
    if (match.status === 'PAUSED') return 'HT';
    if (match.status === 'FINISHED') return 'FT';
    if (match.status === 'TIMED' || match.status === 'SCHEDULED') return 'Not Started';
    if (match.status === 'IN_PLAY') {
        const now = new Date();
        const start = new Date(match.utcDate);
        const diffMs = now.getTime() - start.getTime();
        const diffMins = Math.max(1, Math.floor(diffMs / 60000));

        if (diffMins <= 45) return `${diffMins}'`;
        if (diffMins > 45 && diffMins <= 60) return `45+'`;
        const secondHalfMins = Math.min(90, 45 + (diffMins - 60));
        return `${secondHalfMins}'`;
    }
    return match.status || null;
};

export function useLiveScore(homeTeam: string | undefined, awayTeam: string | undefined, kickoff?: string | number) {
    const [liveScore, setLiveScore] = useState<SportLiveScore | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!homeTeam || !awayTeam) {
            setLoading(false);
            return;
        }

        let cancelled = false;
        const fixtureDate = toDateOnly(kickoff);

        const fetchScore = async () => {
            try {
                const query = fixtureDate ? `?dateFrom=${fixtureDate}&dateTo=${fixtureDate}` : '';
                const response = await fetch(`/api/sports/live-score${query}`);
                if (!response.ok) throw new Error('Failed to fetch');
                const data = await response.json();

                const matches: FootballMatch[] = Array.isArray(data.matches) ? data.matches : [];
                const match = matches.find((m) => {
                    const apiHome = m.homeTeam?.name || m.homeTeam?.shortName || '';
                    const apiAway = m.awayTeam?.name || m.awayTeam?.shortName || '';
                    return teamMatches(homeTeam, apiHome) && teamMatches(awayTeam, apiAway);
                }) || matches.find((m) => {
                    const apiHome = m.homeTeam?.name || m.homeTeam?.shortName || '';
                    const apiAway = m.awayTeam?.name || m.awayTeam?.shortName || '';
                    return teamMatches(homeTeam, apiHome) || teamMatches(awayTeam, apiAway);
                });

                if (!cancelled) {
                    if (match) {
                        setLiveScore({
                            homeTeam: match.homeTeam.shortName || match.homeTeam.name,
                            awayTeam: match.awayTeam.shortName || match.awayTeam.name,
                            homeGoals: match.score?.fullTime?.home ?? null,
                            awayGoals: match.score?.fullTime?.away ?? null,
                            status: match.status,
                            elapsed: getElapsedMinutes(match),
                            utcDate: match.utcDate
                        });
                    } else {
                        setLiveScore(null);
                    }
                }
            } catch (err) {
                console.error('Live score error:', err);
                if (!cancelled) setLiveScore(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchScore();
        const interval = setInterval(fetchScore, 60000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [homeTeam, awayTeam, kickoff]);

    return { liveScore, loading };
}
