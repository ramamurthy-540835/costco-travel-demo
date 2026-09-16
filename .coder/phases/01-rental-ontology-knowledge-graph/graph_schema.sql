-- Apache AGE graph schema scaffold for mastech-agentic-travel
-- Mirrors mastech-agentic-commerce's agent-service/init/zz-init-graph.sql pattern
-- Graph name: rental_graph

CREATE EXTENSION IF NOT EXISTS age;
LOAD 'age';
SET search_path = ag_catalog, "$user", public;

SELECT create_graph('rental_graph');

-- Vertex labels
SELECT create_vlabel('rental_graph', 'Member');
SELECT create_vlabel('rental_graph', 'MembershipTier');
SELECT create_vlabel('rental_graph', 'Vendor');
SELECT create_vlabel('rental_graph', 'VendorPolicy');
SELECT create_vlabel('rental_graph', 'VehicleClass');
SELECT create_vlabel('rental_graph', 'Location');
SELECT create_vlabel('rental_graph', 'Inventory');
SELECT create_vlabel('rental_graph', 'Reservation');
SELECT create_vlabel('rental_graph', 'NegotiatedTerm');
SELECT create_vlabel('rental_graph', 'Perk');
SELECT create_vlabel('rental_graph', 'AddOn');
SELECT create_vlabel('rental_graph', 'VocabularyTerm');
SELECT create_vlabel('rental_graph', 'Intent');

-- Edge labels
SELECT create_elabel('rental_graph', 'HOLDS_TIER');
SELECT create_elabel('rental_graph', 'MADE');
SELECT create_elabel('rental_graph', 'AT_LOCATION');
SELECT create_elabel('rental_graph', 'WITH_VENDOR');
SELECT create_elabel('rental_graph', 'FOR_INVENTORY');
SELECT create_elabel('rental_graph', 'INSTANCE_OF');
SELECT create_elabel('rental_graph', 'LOCATED_AT');
SELECT create_elabel('rental_graph', 'OFFERED_BY');
SELECT create_elabel('rental_graph', 'GOVERNED_BY');
SELECT create_elabel('rental_graph', 'ELIGIBLE_FOR');
SELECT create_elabel('rental_graph', 'OFFERS_TERM');
SELECT create_elabel('rental_graph', 'INCLUDES_PERK');
SELECT create_elabel('rental_graph', 'WAIVES');
SELECT create_elabel('rental_graph', 'REQUESTED');
SELECT create_elabel('rental_graph', 'PARENT_OF');
SELECT create_elabel('rental_graph', 'SYNONYM_OF');
SELECT create_elabel('rental_graph', 'TARGETS');

-- Recommended property indexes (AGE vertices/edges are stored as agtype in normal tables)
CREATE INDEX IF NOT EXISTS member_id_idx ON rental_graph."Member" USING gin (properties);
CREATE INDEX IF NOT EXISTS vendor_provider_idx ON rental_graph."Vendor" USING gin (properties);
CREATE INDEX IF NOT EXISTS reservation_id_idx ON rental_graph."Reservation" USING gin (properties);
CREATE INDEX IF NOT EXISTS negotiated_term_idx ON rental_graph."NegotiatedTerm" USING gin (properties);

-- Example seed pattern (one Vendor x MembershipTier NegotiatedTerm), repeat per data/synthetic/negotiated_terms.json row:
-- SELECT * FROM cypher('rental_graph', $$
--   MERGE (v:Vendor {provider: 'Alamo', rating: 4.7})
--   MERGE (t:MembershipTier {tier_id: 'executive', name: 'Executive'})
--   MERGE (nt:NegotiatedTerm {term_id: 'nt_002', discount_pct: 10.0, included_miles: 'Unlimited', cancellation_window_hours: 24})
--   MERGE (v)-[:OFFERS_TERM]->(nt)
--   MERGE (t)-[:ELIGIBLE_FOR]->(nt)
--   MERGE (p:Perk {perk_id: 'free_additional_driver', name: 'Free Additional Driver'})
--   MERGE (nt)-[:INCLUDES_PERK]->(p)
-- $$) AS (result agtype);

-- Example query: resolve a member's negotiated terms with a vendor
-- SELECT * FROM cypher('rental_graph', $$
--   MATCH (m:Member {member_id: $member_id})-[:HOLDS_TIER]->(t:MembershipTier)
--         -[:ELIGIBLE_FOR]->(nt:NegotiatedTerm)<-[:OFFERS_TERM]-(v:Vendor {provider: $provider})
--   OPTIONAL MATCH (nt)-[:INCLUDES_PERK]->(p:Perk)
--   RETURN nt, collect(p)
-- $$) AS (term agtype, perks agtype);

-- Example: Vocabulary/Taxonomy/Thesaurus layers (Plan 01-01)
-- PARENT_OF direction (TAXONOMY.md): child -> parent
-- SELECT * FROM cypher('rental_graph', $$
--   MERGE (economy:VehicleClass {class_name: 'Economy'})
--   MERGE (standard:VehicleClass {class_name: 'Standard'})
--   MERGE (economy)-[:PARENT_OF]->(standard)
-- $$) AS (result agtype);

-- SYNONYM_OF direction (THESAURUS.md): alias -> canonical
-- SELECT * FROM cypher('rental_graph', $$
--   MERGE (alias:VocabularyTerm {term: 'Compact Plus'})
--   MERGE (canonical:VehicleClass {class_name: 'Compact'})
--   MERGE (alias)-[:SYNONYM_OF]->(canonical)
-- $$) AS (result agtype);

-- Example: Agent-Enablement Ontology Layer (Phase 2)
-- Attribute-level synonyms are a `synonyms` list property directly on the node (no new edge):
-- SELECT * FROM cypher('rental_graph', $$
--   MERGE (vc:VehicleClass {class_name: 'SUV'})
--   SET vc.synonyms = ['crossover', '4x4', 'truck-like']
-- $$) AS (result agtype);

-- TARGETS direction: Intent -> the graph entity type it acts on
-- SELECT * FROM cypher('rental_graph', $$
--   MERGE (i:Intent {intent_id: 'cancel_reservation'})
--   MERGE (r:Reservation {reservation_id: $reservation_id})
--   MERGE (i)-[:TARGETS]->(r)
-- $$, %s::agtype) AS (result agtype);
