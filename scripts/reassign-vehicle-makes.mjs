// One-off script: expands vehicle_make/vehicle_model variety per VehicleClass in
// data/reference/mock-data/rental_inventory.json (which originally hardcoded a single
// (make, model) pair per class across all 1000 rows). Deterministic (hash of rental_id),
// so re-running produces the same assignment. Run once, then reload the graph via
// `python3 graph/scripts/load_seed_data.py`.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'reference', 'mock-data', 'rental_inventory.json');

// Existing (kept) pair listed first, so hash bucket 0 preserves today's assignment.
const ROSTER = {
  Economy: [
    ['Nissan', 'Versa'],
    ['Hyundai', 'Accent'],
    ['Kia', 'Rio'],
  ],
  Compact: [
    ['Toyota', 'Corolla'],
    ['Honda', 'Civic'],
    ['Mazda', 'Mazda3'],
  ],
  'Mid-size': [
    ['Toyota', 'Camry'],
    ['Honda', 'Accord'],
    ['Hyundai', 'Sonata'],
  ],
  'Full-size': [
    ['Chevrolet', 'Malibu'],
    ['Nissan', 'Altima'],
    ['Ford', 'Fusion'],
  ],
  SUV: [
    ['Toyota', 'RAV4'],
    ['Honda', 'CR-V'],
    ['Ford', 'Escape'],
  ],
  Luxury: [
    ['BMW', '3 Series'],
    ['Mercedes-Benz', 'C-Class'],
    ['Audi', 'A4'],
  ],
  Convertible: [
    ['Ford', 'Mustang'],
    ['Chevrolet', 'Camaro'],
    ['Mazda', 'MX-5'],
  ],
  Minivan: [
    ['Chrysler', 'Pacifica'],
    ['Honda', 'Odyssey'],
    ['Toyota', 'Sienna'],
  ],
  Pickup: [
    ['Ford', 'F-150'],
    ['Chevrolet', 'Silverado'],
    ['Ram', '1500'],
  ],
  // Alias of Compact — reuses Compact's roster so its inventory matches once normalized.
  'Compact Plus': [
    ['Toyota', 'Corolla'],
    ['Honda', 'Civic'],
    ['Mazda', 'Mazda3'],
  ],
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
  const roster = ROSTER[row.vehicle_class];
  if (!roster) {
    throw new Error(`No roster defined for vehicle_class "${row.vehicle_class}" (rental_id ${row.rental_id})`);
  }
  const bucket = hashString(row.rental_id) % roster.length;
  const [make, model] = roster[bucket];
  row.vehicle_make = make;
  row.vehicle_model = model;

  const key = `${row.vehicle_class} | ${make} ${model}`;
  counts[key] = (counts[key] ?? 0) + 1;
}

writeFileSync(FILE, JSON.stringify(rows, null, 2) + '\n');

console.log('Updated', rows.length, 'rows. Distribution:');
for (const [key, count] of Object.entries(counts).sort()) {
  console.log(' ', key, '->', count);
}
