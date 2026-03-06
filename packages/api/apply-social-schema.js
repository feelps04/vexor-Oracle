// Apply social schema to Supabase PostgreSQL
// Run: node apply-social-schema.js

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load .env from root
function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...rest] = trimmed.split('=');
        if (key && rest.length > 0) {
          process.env[key] = rest.join('=');
        }
      }
    }
    console.log('Loaded .env from', envPath);
  }
}

loadEnv();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL not set in environment');
    process.exit(1);
  }

  console.log('Connecting to database...');
  const pool = new Pool({ 
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const schemaPath = path.join(__dirname, 'sql', 'social_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('Applying social schema...');
    await pool.query(schema);
    
    console.log('✓ Social schema applied successfully!');
    console.log('Tables created: social_users, social_posts, social_stories, social_likes, social_comments, social_follows, social_messages, social_squads, social_squad_members, social_squad_messages, social_notifications');
    
  } catch (err) {
    console.error('Error applying schema:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
