import { NextResponse } from 'next/server';

export const revalidate = 10; // Cache for 10 seconds to avoid API limit

export async function GET() {
    try {
        const apiKey = process.env.FOOTBALL_DATA_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'Missing API key' }, { status: 500 });
        }

        const response = await fetch(`https://api.football-data.org/v4/matches`, {
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
