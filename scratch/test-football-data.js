const https = require('https');

const options = {
  hostname: 'api.football-data.org',
  path: '/v4/matches?dateFrom=2026-05-04&dateTo=2026-05-05',
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
      if (parsed.matches && parsed.matches.length > 0) {
        console.log(`Found ${parsed.matches.length} matches.`);
        const sample = parsed.matches[0];
        console.log("Sample Match:");
        console.log(`- Teams: ${sample.homeTeam.name} vs ${sample.awayTeam.name}`);
        console.log(`- Status: ${sample.status}`);
        console.log(`- Score:`, sample.score);
        console.log(`- UTC Date: ${sample.utcDate}`);
        
        // Find one that is FINISHED
        const finishedMatch = parsed.matches.find(m => m.status === 'FINISHED');
        if (finishedMatch) {
            console.log("\nFound a FINISHED match:");
            console.log(`- Teams: ${finishedMatch.homeTeam.name} vs ${finishedMatch.awayTeam.name}`);
            console.log(`- Status: ${finishedMatch.status}`);
            console.log(`- Score:`, finishedMatch.score);
        } else {
            console.log("\nNo FINISHED matches found in this date range.");
        }
      } else {
        console.log('No matches found or error in response:');
        console.log(parsed);
      }
    } catch (e) {
      console.error('Error parsing JSON', e);
      console.log(data);
    }
  });
});

req.on('error', (error) => {
  console.error('Error with request:', error);
});

req.end();
