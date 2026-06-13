type Season = "Spring" | "Summer" | "Fall" | "Winter";

const SEASONS: Season[] = ["Spring", "Summer", "Fall", "Winter"];

// Adjust this if your game uses a different season length
const DAYS_PER_SEASON = 30;

interface ParsedSeasonDate {
  season: Season;
  day: number;
}

/**
 * Parses strings like:
 * "Spring 21"
 * "Winter 5"
 */
function parseSeasonDate(input: string): ParsedSeasonDate {
  const match = input.trim().match(/^(Spring|Summer|Fall|Winter)\s+(\d+)$/i);

  if (!match) {
    throw new Error(`Invalid season date format: "${input}"`);
  }

  return {
    season: match[1] as Season,
    day: Number(match[2]),
  };
}

/**
 * Converts a seasonal date into an absolute day number
 * within a looping 4-season year.
 */
function toAbsoluteDay(date: ParsedSeasonDate): number {
  const seasonIndex = SEASONS.indexOf(date.season);

  return seasonIndex * DAYS_PER_SEASON + (date.day - 1);
}

/**
 * Returns how many days remain in the range window.
 *
 * Example:
 * range = "Spring 21 to Summer 27"
 * current = "Spring 22"
 *
 * result => 35
 */
function daysRemainingInRange(
  range: string,
  current: string
): number {
  const [startRaw, endRaw] = range.split(/\s+to\s+/i);

  if (!startRaw || !endRaw) {
    throw new Error(`Invalid range format: "${range}"`);
  }

  const start = parseSeasonDate(startRaw);
  const end = parseSeasonDate(endRaw);
  const now = parseSeasonDate(current);

  const startDay = toAbsoluteDay(start);
  const endDay = toAbsoluteDay(end);
  const currentDay = toAbsoluteDay(now);

  if (startDay <= endDay) {
    // Normal range within one year (e.g. Spring 1 to Fall 28)
    if (currentDay < startDay || currentDay > endDay) return 0;
    return endDay - currentDay + 1;
  } else {
    // Year-wrapping range (e.g. Winter 21 to Spring 28)
    if (currentDay > endDay && currentDay < startDay) return 0;
    const daysInYear = SEASONS.length * DAYS_PER_SEASON;
    if (currentDay >= startDay) return daysInYear - currentDay + endDay + 1;
    return endDay - currentDay + 1;
  }
}

// Example usage
console.log(
  daysRemainingInRange(
    "Spring 21 to Summer 27",
    "Spring 22"
  )
);

// Output: 36