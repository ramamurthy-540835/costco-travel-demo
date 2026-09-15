// One-off script: adds fuel_policy and deposit_amount to every row in
// data/reference/mock-data/rental_inventory.json. Deterministic (hash of rental_id
// for fuel_policy, vehicle_class tier for deposit_amount), so re-running produces
// the same assignment. Run once, then reload the graph via
// `python3 graph/scripts/load_seed_data.py`.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'reference', 'mock-data', 'rental_inventory.json');

const FUEL_POLICIES = ['Free Tank', 'Full to Full', 'Like for Like'];

const DEPOSIT_TIERS = {
  Economy: 150,
  Compact: 150,
  'Compact Plus': 150,
  'Mid-size': 150,
  'Full-size': 250,
  SUV: 250,
  Minivan: 250,
  Luxury: 400,
  Convertible: 400,
  Pickup: 400,
};

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const rows = JSON.parse(readFileSync(FILE, 'utf8'));

const counts = {};
for (const row of rows) {
  const deposit = DEPOSIT_TIERS[row.vehicle_class];
  if (deposit === undefined) {
    throw new Error(`No deposit tier defined for vehicle_class "${row.vehicle_class}" (rental_id ${row.rental_id})`);
  }
  row.fuel_policy = FUEL_POLICIES[hashString(row.rental_id) % FUEL_POLICIES.length];
  row.deposit_amount = deposit;

  const key = `${row.vehicle_class} | ${row.fuel_policy} | $${deposit}`;
  counts[key] = (counts[key] ?? 0) + 1;
}

writeFileSync(FILE, JSON.stringify(rows, null, 2) + '\n');

console.log('Updated', rows.length, 'rows. Distribution:');
for (const [key, count] of Object.entries(counts).sort()) {
  console.log(' ', key, '->', count);
}
