import { NextResponse } from 'next/server';

const FOOTBALL_API_KEY = process.env.FOOTBALL_DATA_API_KEY || process.env.NEXT_PUBLIC_FOOTBALL_DATA_API_KEY || '';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fixtureId = searchParams.get('fixtureId');
  if (!fixtureId) {
    return NextResponse.json({ error: 'fixtureId is required' }, { status: 400 });
  }

  if (!FOOTBALL_API_KEY) {
    return NextResponse.json({
      fixtureId: Number(fixtureId),
      status: 'API_KEY_REQUIRED',
      message: 'Set FOOTBALL_DATA_API_KEY to enable live scores.'
    });
  }

  const response = await fetch(`https://api.football-data.org/v4/matches/${fixtureId}`, {
    headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
    next: { revalidate: 30 }
  });

  if (!response.ok) {
    return NextResponse.json({ error: 'football-data request failed', status: response.status }, { status: 502 });
  }

  const data = await response.json();
  const match = data.match;

  return NextResponse.json({
    fixtureId: Number(fixtureId),
    status: match?.status,
    elapsed: match?.minute,
    league: match?.competition?.name,
    homeTeam: match?.homeTeam?.name,
    awayTeam: match?.awayTeam?.name,
    homeGoals: match?.score?.fullTime?.home ?? match?.score?.halfTime?.home ?? null,
    awayGoals: match?.score?.fullTime?.away ?? match?.score?.halfTime?.away ?? null,
    kickoff: match?.utcDate ? Math.floor(Date.parse(match.utcDate) / 1000) : null
  });
}
