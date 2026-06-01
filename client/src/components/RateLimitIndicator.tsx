import { useEffect, useState } from 'react';

type RateInfo = {
  max: number;
  window: number;
  remaining: number;
  resetIn: number;
  allowed: boolean;
  source?: string;
};

type RateResponse = {
  db: RateInfo;
  supabase?: RateInfo;
};

export default function RateLimitIndicator() {
  const [rate, setRate] = useState<RateInfo | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchRate = async () => {
      try {
        const res = await fetch('/api/email-rate-limit');
        if (!res.ok) {
          setRate(null);
          return;
        }
        const json = (await res.json()) as RateResponse;
        if (mounted) setRate(json.supabase ?? { ...json.db, source: 'db' });
      } catch (err) {
        console.error('Failed to fetch rate info', err);
        if (mounted) setRate(null);
      }
    };

    fetchRate();
    const iv = setInterval(fetchRate, 5000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, []);

  if (!rate) return <div className="mr-4 text-sm text-yellow-200">Rate: ?</div>;

  const resetIn = Number.isFinite(rate.resetIn) && rate.resetIn > 0 ? rate.resetIn : 1;
  const minutes = Math.floor(resetIn / 60);
  const seconds = resetIn % 60;
  const when = resetIn >= 60 ? `${minutes}m ${seconds}s` : `${resetIn}s`;
  const prefix = rate.source === 'supabase' ? 'Supabase' : 'Tracked fallback';

  const title = 'Supabase Email Queries Remaining:';
  const bodyClass = rate.allowed ? 'text-green-200' : 'text-red-200';
  const fallbackInfoIcon = (
    <span
      className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-400 bg-slate-700 text-xs font-semibold text-slate-200"
      title="Live Supabase values are only available after an actual auth email request (new user invite or password reset)."
      aria-label="Live Supabase values are only available after an actual auth email request"
    >
      i
    </span>
  );

  return (
    <div className="mr-4 text-sm">
      <div className="font-semibold text-slate-100">{title}</div>
      <div className={bodyClass}>
        {rate.source === 'db' ? (
          <>
            {fallbackInfoIcon}
            {prefix}: {rate.remaining}/{rate.max}
          </>
        ) : (
          <>{prefix}: {rate.remaining}/{rate.max}</>
        )}
      </div>
      {rate.allowed ? null : (
        <div className="text-sm text-red-200">resets in {when}</div>
      )}
    </div>
  );
}
