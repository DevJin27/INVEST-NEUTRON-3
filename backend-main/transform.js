const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/data/portfolio-game.json');
const rawData = fs.readFileSync(filePath, 'utf8');
const rounds = JSON.parse(rawData);

const FAKE_SOURCES = ['WhatsApp Forward', 'Twitter / X', 'Anonymous Blog', 'Unverified Rumor'];
const AD_SOURCES = ['Sponsored Post', 'Promoted Content', 'Paid Placement: Acme Wealth'];
const REAL_SOURCES = ['Reuters', 'Bloomberg', 'Financial Times', 'Wall Street Journal', 'Economic Times', 'Mint'];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const updatedRounds = rounds.map(round => {
  round.companies = round.companies.map(company => {
    // Keep the original true headline but nest it
    const originalNews = {
      id: `${company.id}-news-1`,
      source: getRandomItem(REAL_SOURCES),
      headline: company.headline,
      detail: company.detail,
      sentiment: company.sentiment
    };
    
    // Create a fake news / rumor
    const isFakeNegative = Math.random() > 0.5;
    const fakeNews = {
      id: `${company.id}-news-2`,
      source: getRandomItem(FAKE_SOURCES),
      headline: isFakeNegative 
        ? `${company.name} facing undisclosed SEC investigation?`
        : `Leaked docs show ${company.name} about to acquire major competitor!`,
      detail: isFakeNegative
        ? `A forward circulating in trader groups suggests massive accounting irregularities at ${company.name}.`
        : `Unconfirmed screenshots indicate a massive buyout is imminent. Analysts say this could double the stock.`,
      sentiment: isFakeNegative ? 'negative' : 'positive'
    };

    // Create an Ad / Irrelevant news
    const adNews = {
      id: `${company.id}-news-3`,
      source: getRandomItem(AD_SOURCES),
      headline: `Top 3 Reasons to LOAD UP on ${company.name} Now`,
      detail: `Our proprietary algorithm screams BUY. Don't miss out on what could be the trade of the decade. Click here for full access.`,
      sentiment: 'positive'
    };

    // Shuffle the news items
    const newsFeed = [originalNews, fakeNews, adNews];
    newsFeed.sort(() => Math.random() - 0.5);

    // Build new company object
    const newCompany = {
      id: company.id,
      name: company.name,
      sector: company.sector,
      newsFeed: newsFeed
    };

    return newCompany;
  });
  return round;
});

fs.writeFileSync(filePath, JSON.stringify(updatedRounds, null, 2), 'utf8');
console.log('Successfully transformed portfolio-game.json');
