'use client';

import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { mockLocations } from './mock-data';

export function LocationAutocomplete({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches =
    value.trim().length === 0
      ? mockLocations
      : mockLocations.filter((loc) => loc.toLowerCase().includes(value.toLowerCase()));

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <Input
        placeholder={placeholder ?? 'City or airport'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        className={className}
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-56 w-full min-w-48 overflow-auto rounded-lg border border-input bg-popover py-1 shadow-md">
          {matches.map((loc) => (
            <button
              key={loc}
              type="button"
              onClick={() => {
                onChange(loc);
                setOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            >
              {loc}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
