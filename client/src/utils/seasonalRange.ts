// Client-side mirror of server/helpers/daysLeftInRange.ts
// Keep the two in sync if the season/day model ever changes.

type Season = 'Spring' | 'Summer' | 'Fall' | 'Winter';

const SEASONS: Season[] = ['Spring', 'Summer', 'Fall', 'Winter'];
const DAYS_PER_SEASON = 30;

function parseSeasonDate(input: string): { season: Season; day: number } {
  const match = input.trim().match(/^(Spring|Summer|Fall|Winter)\s+(\d+)$/i);
  if (!match) throw new Error(`Invalid season date: "${input}"`);
  return { season: match[1] as Season, day: Number(match[2]) };
}

function toAbsoluteDay(date: { season: Season; day: number }): number {
  return SEASONS.indexOf(date.season) * DAYS_PER_SEASON + (date.day - 1);
}

/**
 * Returns how many days remain until the end of the active range.
 * Returns 0 if the current date is outside the range, or if parsing fails.
 *
 * range   — e.g. "Spring 21 to Summer 27"
 * current — e.g. "Spring 22"  (matches DateContext.getCurrentDateString())
 */
export function daysRemainingInRange(range: string, current: string): number {
  if (!range || !current) return 0;
  try {
    const [startRaw, endRaw] = range.split(/\s+to\s+/i);
    if (!startRaw || !endRaw) return 0;

    const startDay = toAbsoluteDay(parseSeasonDate(startRaw));
    const endDay = toAbsoluteDay(parseSeasonDate(endRaw));
    const currentDay = toAbsoluteDay(parseSeasonDate(current));

    if (currentDay < startDay || currentDay > endDay) return 0;
    return endDay - currentDay + 1;
  } catch {
    return 0;
  }
}
