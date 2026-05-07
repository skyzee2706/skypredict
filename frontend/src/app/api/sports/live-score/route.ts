import { NextRequest, NextResponse } from 'next/server';

export const revalidate = 10;

function normalizeDateParam(value: string | null): string | null {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    return value;
}

export async function GET(request: NextRequest) {
    try {
        const apiKey = process.env.FOOTBALL_DATA_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'Missing API key' }, { status: 500 });
        }

        const { searchParams } = new URL(request.url);
        const dateFrom = normalizeDateParam(searchParams.get('dateFrom'));
        const dateTo = normalizeDateParam(searchParams.get('dateTo'));
        const query = dateFrom && dateTo ? `?dateFrom=${dateFrom}&dateTo=${dateTo}` : '';

        const response = await fetch(`https://api.football-data.org/v4/matches${query}`, {
            headers: {
                'X-Auth-Token': apiKey
            },
            next: { revalidate: 10 }
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('API Error:', errText);
            return NextResponse.json({ error: 'Failed to fetch from API' }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Proxy Error:', error.message);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
