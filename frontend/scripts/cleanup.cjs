const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^[ '\"]|[ '\"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function normalize(address) {
  return String(address || '').toLowerCase();
}

function activityKey(row) {
  return `${row.tx_hash}:${row.log_index}`;
}

async function main() {
  loadEnv(path.join(__dirname, '..', '.env.local'));
  loadEnv(path.join(__dirname, '..', '..', '.env'));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const dryRun = process.argv.includes('--dry-run');
  const targetWallet = normalize(process.argv.find((arg) => arg.startsWith('--wallet='))?.split('=')[1] || '');

  if (targetWallet) {
    console.log(`[cleanup] wallet filter enabled: ${targetWallet}`);
  } else {
    console.log('[cleanup] universal mode: scanning every user');
  }

  const { data, error } = await supabase
    .from('user_activities')
    .select('tx_hash, log_index, user_address, market_address, status')
    .in('status', ['RUNNING', 'WIN', 'LOSE', 'CLAIMED']);
  if (error) throw error;

  const rows = data || [];
  const finalizedUserMarkets = new Set();

  for (const row of rows) {
    const status = String(row.status || '').toUpperCase();
    if (status === 'WIN' || status === 'LOSE' || status === 'CLAIMED') {
      finalizedUserMarkets.add(`${normalize(row.user_address)}:${normalize(row.market_address)}`);
    }
  }

  const staleRunningRows = rows.filter((row) => {
    const user = normalize(row.user_address);
    const status = String(row.status || '').toUpperCase();
    const userMarket = `${user}:${normalize(row.market_address)}`;
    const walletMatches = !targetWallet || user === targetWallet;
    return walletMatches && status === 'RUNNING' && finalizedUserMarkets.has(userMarket);
  });

  const uniqueRows = [...new Map(staleRunningRows.map((row) => [activityKey(row), row])).values()];
  const byUser = new Map();
  for (const row of uniqueRows) {
    const user = normalize(row.user_address);
    byUser.set(user, (byUser.get(user) || 0) + 1);
  }

  console.log(`[cleanup] total activities scanned: ${rows.length}`);
  console.log(`[cleanup] finalized user-market pairs: ${finalizedUserMarkets.size}`);
  console.log(`[cleanup] stale RUNNING rows found: ${uniqueRows.length}`);
  for (const [user, count] of byUser.entries()) {
    console.log(`[cleanup] ${user}: ${count} stale rows`);
  }

  if (dryRun) {
    console.log('[cleanup] dry-run only, no rows deleted');
    return;
  }

  for (const row of uniqueRows) {
    const { error: deleteError } = await supabase
      .from('user_activities')
      .delete()
      .eq('tx_hash', row.tx_hash)
      .eq('log_index', row.log_index);
    if (deleteError) throw deleteError;
  }

  console.log(`[cleanup] deleted ${uniqueRows.length} stale RUNNING rows`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
