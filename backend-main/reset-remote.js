// Run this locally via `node reset-remote.js` to instantly clear all teams and state from your deployed Neon DB
const { neon } = require('@neondatabase/serverless');

const REMOTE_DB_URL = 'postgresql://neondb_owner:npg_qMSkpN3VoXr7@ep-spring-bread-a1n45s9z-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function resetRemote() {
  console.log("Connecting to Neon DB...");
  const sql = neon(REMOTE_DB_URL);
  
  try {
    await sql`DELETE FROM game_state;`;
    console.log("✅ Success! Remote Teams count successfully reset to 0.");
  } catch (error) {
    console.error("❌ Failed to query Neon Database:", error);
  }
}

resetRemote();
