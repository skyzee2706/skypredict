import { useState, useEffect } from 'react';

export interface SportLiveScore {
    homeTeam: string;
    awayTeam: string;
    homeGoals: number | null;
    awayGoals: number | null;
    status: string; // IN_PLAY, PAUSED, FINISHED, TIMED
    elapsed: string | null; // e.g. "45'", "HT", "FT"
    utcDate: string;
}

const getElapsedMinutes = (match: any): string | null => {
    if (match.status === 'PAUSED') return 'HT';
    if (match.status === 'FINISHED') return 'FT';
    if (match.status === 'IN_PLAY') {
        const now = new Date();
        const start = new Date(match.utcDate);
        const diffMs = now.getTime() - start.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins <= 45) return `${diffMins}'`;
        if (diffMins > 45 && diffMins <= 60) return `45+'`; // Half time break estimated
        if (diffMins > 60) {
           const secondHalfMins = 45 + (diffMins - 60); // subtract 15 min HT
           return `${secondHalfMins}'`;
        }
    }
    return null;
};

export function useLiveScore(homeTeam: string | undefined, awayTeam: string | undefined) {
    const [liveScore, setLiveScore] = useState<SportLiveScore | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!homeTeam || !awayTeam) {
            setLoading(false);
            return;
        }

        const fetchScore = async () => {
            try {
                const response = await fetch('/api/sports/live-score');
                if (!response.ok) throw new Error('Failed to fetch');
                const data = await response.json();
                
                if (data.matches) {
                    // Match by team names (case insensitive, partial match for safety)
                    const match = data.matches.find((m: any) => 
                        m.homeTeam.name.toLowerCase().includes(homeTeam.toLowerCase()) ||
                        m.awayTeam.name.toLowerCase().includes(awayTeam.toLowerCase()) ||
                        homeTeam.toLowerCase().includes(m.homeTeam.name.toLowerCase())
                    );

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
                    }
                }
            } catch (err) {
                console.error("Live score error:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchScore();
        const interval = setInterval(fetchScore, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [homeTeam, awayTeam]);

    return { liveScore, loading };
}
