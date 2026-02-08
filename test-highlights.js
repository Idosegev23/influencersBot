// Quick test for highlights scraping
const https = require('https');

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const username = 'the_dekel';

async function testHighlights() {
  console.log(`Testing highlights scrape for @${username}...`);
  
  // Start actor
  const input = {
    usernames: [username],
  };

  const options = {
    hostname: 'api.apify.com',
    path: `/v2/acts/datavoyantlab~advanced-instagram-stories-scraper/runs?token=${APIFY_TOKEN}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.data) {
            console.log('Run started:', result.data.id);
            console.log('Status:', result.data.status);
            console.log('Check: https://console.apify.com/actors/runs/' + result.data.id);
            resolve(result.data);
          } else {
            console.error('Response:', data);
            reject(new Error('Invalid response: ' + data));
          }
        } catch (err) {
          console.error('Parse error:', data);
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(input));
    req.end();
  });
}

testHighlights().then(() => {
  console.log('Test initiated successfully!');
}).catch(err => {
  console.error('Error:', err.message);
});
