// Prototype-only mock data. NOT imported by production code.
//
// Real-schema-aligned fields (match lib/graph/queries.ts return shapes):
//   class_name, synonyms   — VehicleClass
//   term_id, vendor_id     — NegotiatedTerm
//   perk_id, synonyms      — Perk
//
// Prototype-only display fields (no counterpart on the real graph types —
// illustrative only, for this clickable prototype): id, dailyRate, vendorName,
// imageLabel, seats, transmission, mileage, fuelType, doors, hasAC, tripCount.
// Exception: `rating` is a prototype-only field name, but its VALUES are the
// real Vendor.rating from data/reference/mock-data/rental_providers.json
// (matched by vendorName), not invented.

export interface MockPerk {
  perk_id: string;
  synonyms?: string[];
  label: string;
}

export interface MockVehicleClass {
  id: string;
  class_name: string;
  synonyms?: string[];
  vendorName: string;
  vendor_id: string;
  term_id: string;
  dailyRate: number;
  imageLabel: string;
  seats: number;
  transmission: string;
  mileage: string;
  perks: MockPerk[];
  fuelType: string;
  doors: number;
  hasAC: boolean;
  // Reuses the ontology's real Vendor.rating (data/reference/mock-data/rental_providers.json),
  // matched by vendorName — not an invented value.
  rating: number;
  tripCount: number;
}

export const mockVehicleClasses: MockVehicleClass[] = [
  {
    id: '1',
    class_name: 'Economy',
    synonyms: ['cheapest car', 'basic car', 'small car'],
    vendorName: 'Hertz',
    vendor_id: 'vendor_hertz',
    term_id: 'term_001',
    dailyRate: 34,
    imageLabel: 'Economy Sedan',
    seats: 4,
    transmission: 'Automatic',
    mileage: 'Unlimited',
    perks: [
      { perk_id: 'perk_waived_underage_fee', label: 'No under-25 fee' },
      { perk_id: 'perk_free_cancellation', label: 'Free cancellation' },
    ],
    fuelType: 'Gasoline',
    doors: 4,
    hasAC: true,
    rating: 4.5,
    tripCount: 214,
  },
  {
    id: '2',
    class_name: 'SUV',
    synonyms: ['crossover', '4x4', 'truck-like'],
    vendorName: 'Sixt',
    vendor_id: 'vendor_sixt',
    term_id: 'term_014',
    dailyRate: 68,
    imageLabel: 'Midsize SUV',
    seats: 5,
    transmission: 'Automatic',
    mileage: '300 mi/day',
    perks: [
      { perk_id: 'perk_free_second_driver', label: 'Free second driver' },
      { perk_id: 'perk_collision_included', label: 'Collision waiver included' },
    ],
    fuelType: 'Gasoline',
    doors: 4,
    hasAC: true,
    rating: 4.6,
    tripCount: 187,
  },
  {
    id: '3',
    class_name: 'Compact',
    synonyms: ['Compact Plus'],
    vendorName: 'Payless',
    vendor_id: 'vendor_payless',
    term_id: 'term_022',
    dailyRate: 41,
    imageLabel: 'Compact Hatchback',
    seats: 4,
    transmission: 'Manual',
    mileage: 'Unlimited',
    perks: [{ perk_id: 'perk_free_cancellation', label: 'Free cancellation' }],
    fuelType: 'Hybrid',
    doors: 4,
    hasAC: true,
    rating: 3.9,
    tripCount: 96,
  },
  {
    id: '4',
    class_name: 'Premium',
    synonyms: ['luxury', 'executive'],
    vendorName: 'Thrifty',
    vendor_id: 'vendor_thrifty',
    term_id: 'term_009',
    dailyRate: 95,
    imageLabel: 'Premium Sedan',
    seats: 5,
    transmission: 'Automatic',
    mileage: 'Unlimited',
    perks: [
      { perk_id: 'perk_waived_underage_fee', label: 'No under-25 fee' },
      { perk_id: 'perk_free_second_driver', label: 'Free second driver' },
      { perk_id: 'perk_collision_included', label: 'Collision waiver included' },
    ],
    fuelType: 'Gasoline',
    doors: 2,
    hasAC: true,
    rating: 4.1,
    tripCount: 143,
  },
  {
    id: '5',
    class_name: 'Minivan',
    synonyms: ['van', 'people carrier'],
    vendorName: 'Dollar',
    vendor_id: 'vendor_dollar',
    term_id: 'term_017',
    dailyRate: 74,
    imageLabel: '7-Seat Minivan',
    seats: 7,
    transmission: 'Automatic',
    mileage: 'Unlimited',
    perks: [{ perk_id: 'perk_free_cancellation', label: 'Free cancellation' }],
    fuelType: 'Gasoline',
    doors: 4,
    hasAC: true,
    rating: 4.0,
    tripCount: 78,
  },
];

export function getMockVehicleById(id: string): MockVehicleClass | undefined {
  return mockVehicleClasses.find((v) => v.id === id);
}

export interface MockVendor {
  id: string;
  name: string;
}

export const mockVendors: MockVendor[] = Array.from(
  new Map(mockVehicleClasses.map((v) => [v.vendor_id, { id: v.vendor_id, name: v.vendorName }])).values(),
);

// Reuses the graph ontology's Location node data (city/airport_code, from
// data/reference/mock-data/rental_inventory.json) — not a new location set.
export const mockLocations: string[] = [
  'Las Vegas (LAS)',
  'Orlando (MCO)',
  'Los Angeles (LAX)',
  'San Francisco (SFO)',
  'Seattle (SEA)',
  'Phoenix (PHX)',
  'Denver (DEN)',
  'Dallas (DFW)',
  'New York (JFK)',
  'Chicago (ORD)',
];

export interface MockBooking {
  id: string;
  vehicleId: string;
  startDate: string;
  endDate: string;
  status: 'upcoming' | 'completed' | 'cancelled';
  total: number;
}

export const mockBookings: MockBooking[] = [
  {
    id: 'booking_1',
    vehicleId: '1',
    startDate: '2026-09-12',
    endDate: '2026-09-15',
    status: 'upcoming',
    total: 102,
  },
  {
    id: 'booking_2',
    vehicleId: '4',
    startDate: '2026-06-02',
    endDate: '2026-06-06',
    status: 'completed',
    total: 380,
  },
  {
    id: 'booking_3',
    vehicleId: '2',
    startDate: '2026-04-20',
    endDate: '2026-04-22',
    status: 'cancelled',
    total: 136,
  },
];
