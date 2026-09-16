import { BRAND_COLORS } from '@/lib/vendor-brand-colors';

export function VendorMarquee({ providers }: { providers: string[] }) {
  const doubled = [...providers, ...providers];

  return (
    <div
      className="overflow-hidden"
      style={{
        maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
        WebkitMaskImage:
          'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
      }}
    >
      <style>{`
        @keyframes vendor-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
      <div
        className="flex w-max gap-4 [animation:vendor-marquee_30s_linear_infinite] hover:[animation-play-state:paused]"
      >
        {doubled.map((provider, i) => (
          <div
            key={`${provider}-${i}`}
            className="flex min-w-32 items-center justify-center rounded-xl border-t-4 bg-card px-8 py-6 ring-1 ring-foreground/10 transition-transform hover:-translate-y-0.5 hover:shadow-md"
            style={{ borderTopColor: BRAND_COLORS[provider] ?? 'transparent' }}
          >
            <span
              className={`font-heading text-lg font-semibold whitespace-nowrap ${
                BRAND_COLORS[provider] ? '' : 'text-foreground/80'
              }`}
              style={BRAND_COLORS[provider] ? { color: BRAND_COLORS[provider] } : undefined}
            >
              {provider}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
