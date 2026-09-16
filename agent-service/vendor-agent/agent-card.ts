export const AGENT_CARD = {
  name: 'Vendor Agent',
  description:
    'Rental-vendor A2A surface: inventory availability, modification/cancellation quotes, and vendor policy lookup, parameterized per vendor.',
  url: `http://localhost:${process.env.VENDOR_AGENT_PORT ?? '4100'}/a2a`,
  skills: [
    {
      id: 'check_availability',
      name: 'check_availability',
      description: 'Check whether an inventory unit is free of conflicting reserved/checked-in bookings for a date range.',
      inputSchema: {
        vendorId: 'string',
        inventoryId: 'string',
        from: 'string (ISO date)',
        to: 'string (ISO date)',
      },
    },
    {
      id: 'apply_modification',
      name: 'apply_modification',
      description: 'Quote a modification against the negotiated rate/perks for a vendor+inventory+date range, applying the vendor cutoff policy.',
      inputSchema: {
        vendorId: 'string',
        inventoryId: 'string',
        from: 'string (ISO date)',
        to: 'string (ISO date)',
      },
    },
    {
      id: 'apply_cancellation',
      name: 'apply_cancellation',
      description: "Quote a cancellation refund against the vendor's cancellation-window policy.",
      inputSchema: {
        vendorId: 'string',
        hoursUntilStart: 'number',
      },
    },
    {
      id: 'get_vendor_policy',
      name: 'get_vendor_policy',
      description: 'Look up a vendor’s modification-cutoff/cancellation-window/no-show-fee policy.',
      inputSchema: {
        vendorId: 'string',
      },
    },
  ],
};
