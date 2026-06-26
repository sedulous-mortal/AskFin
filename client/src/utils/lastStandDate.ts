// During the Year 1 Last Stand event, the game freezes currentDate in the save
// file for the entire duration (Winter 14–25). The actual in-game calendar is
// 12 days ahead of what the save file reports. Any date in that affected window
// must be shifted forward by 12 before showing in the UI.
export function correctLastStandDate(
  day: number,
  season: number,
  year: number,
): { day: number; season: number } {
  if (year === 1 && season === 3 && day >= 14 && day <= 25) {
    const corrected = day + 12;
    if (corrected <= 28) return { day: corrected, season };
    // Days 17–25 overflow past Winter 28 into Spring of Year 2
    return { day: corrected - 28, season: 0 };
  }
  return { day, season };
}
