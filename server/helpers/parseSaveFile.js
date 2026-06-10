const KEY = "3829347201";

function xorDecrypt(buffer) {
  let result = "";
  for (let i = 0; i < buffer.length; i++) {
    result += String.fromCharCode(buffer[i] ^ KEY.charCodeAt(i % KEY.length));
  }
  return result;
}

// XOR artifacts: the key causes some ':' separators to decode as '=', ';', or ','
// and some digits to decode as '>'. Both patterns are handled below.

function extractString(text, fieldName) {
  const pattern = new RegExp(`"${fieldName}"\\s*[=:;,]\\s*"([^"]*)"`, "s");
  const match = text.match(pattern);
  return match ? match[1] : null;
}

function extractNumber(text, fieldName) {
  // Value may start with '>' artifact instead of a digit
  const pattern = new RegExp(`"${fieldName}"\\s*[=:;,]\\s*([>0-9]+(?:\\.[>0-9]*)?)`);
  const match = text.match(pattern);
  if (!match) return null;
  // Strip '>' artifacts — the correct digit is unrecoverable without the original,
  // but removing them produces a numeric value in roughly the right range.
  const cleaned = match[1].replace(/>/g, "");
  return cleaned ? Number(cleaned) : null;
}

function extractArray(text, fieldName) {
  const pattern = new RegExp(`"${fieldName}"\\s*[=:;,]\\s*\\[([^\\]]*)\\]`, "s");
  const match = text.match(pattern);
  if (!match) return [];
  return match[1]
    .split(",")
    .map(s => s.replace(/>/g, "").trim())
    .filter(s => /\d/.test(s))
    .map(s => parseInt(s.replace(/\D/g, ""), 10))
    .filter(n => !isNaN(n));
}

function extractQuestData(text) {
  const pattern = new RegExp(`"questData"\\s*[=:;,]\\s*\\[([^\\]]*)\\]`, "s");
  const match = text.match(pattern);
  if (!match) return [];
  const result = [];
  const objPattern = /\{([^}]*)\}/g;
  let objMatch;
  while ((objMatch = objPattern.exec(match[1])) !== null) {
    const s = objMatch[1];
    const idMatch = s.match(/"ID"\s*[=:;,]\s*([>0-9]+)/);
    const statusMatch = s.match(/"status"\s*[=:;,]\s*([>0-9]+)/);
    if (idMatch && statusMatch) {
      const id = parseInt(idMatch[1].replace(/>/g, ""), 10);
      const status = parseInt(statusMatch[1].replace(/>/g, ""), 10);
      if (!isNaN(id) && !isNaN(status)) result.push({ id, status });
    }
  }
  return result;
}

function extractToolData(text) {
  const pattern = new RegExp(`"listOfToolData"\\s*[=:;,]\\s*\\[([^\\]]*)\\]`, "s");
  const match = text.match(pattern);
  if (!match) return [];
  const result = [];
  const objPattern = /\{([^}]*)\}/g;
  let objMatch;
  while ((objMatch = objPattern.exec(match[1])) !== null) {
    const s = objMatch[1];
    const toolNameMatch = s.match(/"toolName"\s*[=:;,]\s*"([^"]*)"/);
    if (!toolNameMatch) continue;
    const tierMatch = s.match(/"tier"\s*[=:;,]\s*([>0-9]+)/);
    const isUnlockedMatch = s.match(/"isUnlocked"\s*[=:;,]\s*(true|false)/);
    const upgradingMatch = s.match(/"upgrading"\s*[=:;,]\s*(true|false)/);
    const upgradeDaysMatch = s.match(/"upgradeDaysRemaining"\s*[=:;,]\s*([>0-9]+)/);
    const slotNumMatch = s.match(/"slotNum"\s*[=:;,]\s*([>0-9]+)/);
    const maxTierMatch = s.match(/"maxTier"\s*[=:;,]\s*([>0-9]+)/);
    result.push({
      toolName: toolNameMatch[1],
      tier: tierMatch ? parseInt(tierMatch[1].replace(/>/g, ''), 10) : 0,
      isUnlocked: isUnlockedMatch ? isUnlockedMatch[1] === 'true' : true,
      upgrading: upgradingMatch ? upgradingMatch[1] === 'true' : false,
      upgradeDaysRemaining: upgradeDaysMatch ? parseInt(upgradeDaysMatch[1].replace(/>/g, ''), 10) : 0,
      slotNum: slotNumMatch ? parseInt(slotNumMatch[1].replace(/>/g, ''), 10) : -1,
      maxTier: maxTierMatch ? parseInt(maxTierMatch[1].replace(/>/g, ''), 10) : 4,
    });
  }
  return result;
}

function extractNestedNumber(text, parentField, childField) {
  const blockPattern = new RegExp(`"${parentField}"\\s*[=:;,]\\s*\\{([^}]*)\\}`, "s");
  const blockMatch = text.match(blockPattern);
  if (!blockMatch) return null;
  return extractNumber(blockMatch[1], childField);
}

export function parseSaveFile(buffer) {
  const text = xorDecrypt(buffer);
  return {
    fileName: extractString(text, "fileName"),
    playerName: extractString(text, "playerName"),
    farmName: extractString(text, "farmName"),
    saveFileVersion: extractNumber(text, "saveFileVersion"),
    exp: extractNumber(text, "exp"),
    playerSpeciesId: extractNumber(text, "playerSpeciesID"),
    difficulty: extractNumber(text, "difficulty"),
    totalPlayTimeSeconds: extractNumber(text, "totalPlayTimeSeconds"),
    playerPronouns: extractNumber(text, "playerPronouns"),
    fishDiscovered: extractArray(text, "fishDiscovered"),
    crittersDiscovered: extractArray(text, "crittersDiscovered"),
    itemsDiscovered: extractArray(text, "itemsDiscovered"),
    unlockedCraftingRecipes: extractArray(text, "unlockedCraftingRecipes"),
    unlockedCookingRecipes: extractArray(text, "unlockedCookingRecipes"),
    questData: extractQuestData(text),
    toolData: extractToolData(text),
    donatedMuseumItemsCount: extractArray(text, "donatedMuseumItemsList").length,
    currentDateDay: extractNestedNumber(text, "currentDate", "Day"),
    currentDateSeason: extractNestedNumber(text, "currentDate", "Season"),
    currentDateYear: extractNestedNumber(text, "currentDate", "Year"),
  };
}
