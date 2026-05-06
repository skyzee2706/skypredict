const https = require('https');

const options = {
  hostname: 'api.football-data.org',
  path: '/v4/matches', // Fetch today's matches
  method: 'GET',
  headers: {
    'X-Auth-Token': '456ab27e7c0f433087ec7db5dbfb0d71'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log(`Status Code: ${res.statusCode}`);
      if (parsed.matches) {
        console.log(`Found ${parsed.matches.length} matches today.`);
        // Let's print unique statuses we see
        const statuses = new Set(parsed.matches.map(m => m.status));
        console.log("Statuses today:", Array.from(statuses));
        // Print the first match structure for live if any, else first match
        const liveMatch = parsed.matches.find(m => m.status === 'IN_PLAY' || m.status === 'PAUSED');
        if (liveMatch) {
            console.log("\nFound a LIVE match:");
            console.log(`- Status: ${liveMatch.status}`);
            console.log(`- Minute: ${liveMatch.minute}`);
            console.log(`- Score:`, liveMatch.score);
        } else if (parsed.matches.length > 0) {
            console.log("\nSample Match:");
            console.log(parsed.matches[0]);
        }
      }
    } catch (e) {
      console.error('Error parsing JSON', e);
    }
  });
});

req.on('error', (error) => {
  console.error('Error with request:', error);
});

req.end();
