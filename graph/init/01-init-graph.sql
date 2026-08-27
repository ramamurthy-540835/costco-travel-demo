-- Apache AGE graph schema for mastech-agentic-travel
-- Copied verbatim (minus commented examples) from .coder/phases/01-rental-ontology-knowledge-graph/graph_schema.sql
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
