NODE_LABELS = [
    "Member",
    "MembershipTier",
    "Vendor",
    "VendorPolicy",
    "VehicleClass",
    "Location",
    "Inventory",
    "Reservation",
    "NegotiatedTerm",
    "Perk",
    "AddOn",
    "VocabularyTerm",
    "Intent",
    "EquivalenceCluster",
]

EDGE_ENDPOINTS = {
    "HOLDS_TIER": ("Member", "MembershipTier"),
    "MADE": ("Member", "Reservation"),
    "AT_LOCATION": ("Reservation", "Location"),
    "WITH_VENDOR": ("Reservation", "Vendor"),
    "FOR_INVENTORY": ("Reservation", "Inventory"),
    "INSTANCE_OF": ("Inventory", "VehicleClass"),
    "LOCATED_AT": ("Inventory", "Location"),
    "OFFERED_BY": ("Inventory", "Vendor"),
    "GOVERNED_BY": ("Vendor", "VendorPolicy"),
    "ELIGIBLE_FOR": ("MembershipTier", "NegotiatedTerm"),
    "OFFERS_TERM": ("Vendor", "NegotiatedTerm"),
    "INCLUDES_PERK": ("NegotiatedTerm", "Perk"),
    "WAIVES": ("Perk", "AddOn"),
    "REQUESTED": ("Reservation", "AddOn"),
    "PARENT_OF": ("VehicleClass", "VehicleClass"),
    "SYNONYM_OF": ("VocabularyTerm", "VehicleClass"),
    # Intent.TARGETS fans out to several entity types (Reservation, Inventory,
    # NegotiatedTerm, AddOn) per data/synthetic/agent_intents.json; Reservation
    # is used here as the representative pair for the generic existence check.
    "TARGETS": ("Intent", "Reservation"),
    # PART_OF_CLUSTER models VehicleClass substitutability (Phase 7) — distinct from
    # PARENT_OF's Standard/Utility/Premium classification taxonomy.
    "PART_OF_CLUSTER": ("VehicleClass", "EquivalenceCluster"),
}
