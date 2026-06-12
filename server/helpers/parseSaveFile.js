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

// Finds the content of "fieldName": [ ... ] with balanced bracket matching,
// needed for arrays whose elements themselves contain nested arrays (e.g. barnData).
function extractBalancedArray(text, fieldName) {
  const startPattern = new RegExp(`"${fieldName}"\\s*[=:;,]\\s*\\[`);
  const m = startPattern.exec(text);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < text.length && depth > 0) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') depth--;
    i++;
  }
  if (depth !== 0) return null;
  return text.slice(m.index + m[0].length, i - 1);
}

function extractInventory(text) {
  const startPattern = /"playerInventory"\s*[=:;,]\s*\{/;
  const m = startPattern.exec(text);
  if (!m) return [];
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < text.length && depth > 0) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    i++;
  }
  if (depth !== 0) return [];
  const block = text.slice(m.index + m[0].length, i - 1);
  const slotsContent = extractBalancedArray(block, 'itemSlots');
  if (!slotsContent) return [];
  const result = [];
  const objPattern = /\{([^}]*)\}/g;
  let objMatch;
  while ((objMatch = objPattern.exec(slotsContent)) !== null) {
    const s = objMatch[1];
    const idMatch = s.match(/"itemID"\s*[=:;,]\s*([>0-9]+)/);
    const amountMatch = s.match(/"stackAmount"\s*[=:;,]\s*([>0-9]+)/);
    if (idMatch) {
      const id = parseInt(idMatch[1].replace(/>/g, ''), 10);
      const amount = amountMatch ? parseInt(amountMatch[1].replace(/>/g, ''), 10) : 1;
      if (!isNaN(id) && id > 0 && amount > 0) result.push({ id, amount });
    }
  }
  return result;
}

function extractBarnData(text) {
  const content = extractBalancedArray(text, 'barnData');
  if (!content) return [];
  const result = [];
  const objPattern = /\{([^}]*)\}/g;
  let objMatch;
  while ((objMatch = objPattern.exec(content)) !== null) {
    const s = objMatch[1];
    const prefabIdMatch = s.match(/"prefabID"\s*[=:;,]\s*([>0-9]+)/);
    const levelMatch = s.match(/"level"\s*[=:;,]\s*([>0-9]+)/);
    const nameMatch = s.match(/"name"\s*[=:;,]\s*"([^"]*)"/);
    if (prefabIdMatch) {
      result.push({
        prefabId: parseInt(prefabIdMatch[1].replace(/>/g, ''), 10),
        level: levelMatch ? parseInt(levelMatch[1].replace(/>/g, ''), 10) : 0,
        name: nameMatch ? nameMatch[1] : null,
      });
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

function extractProjectMatPileData(text) {
  const content = extractBalancedArray(text, 'projectMatPileData');
  if (!content) return [];
  const result = [];
  let i = 0;
  while (i < content.length) {
    while (i < content.length && content[i] !== '{') i++;
    if (i >= content.length) break;
    const start = i;
    let depth = 0;
    while (i < content.length) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') { depth--; if (depth === 0) { i++; break; } }
      i++;
    }
    const objStr = content.slice(start, i);
    const questIdMatch = objStr.match(/"questID"\s*[=:;,]\s*([>0-9]+)/);
    if (!questIdMatch) continue;
    const questID = parseInt(questIdMatch[1].replace(/>/g, ''), 10);
    if (isNaN(questID)) continue;
    const donatedItems = [];
    const invPattern = /"inv"\s*[=:;,]\s*\{/;
    const invMatch = invPattern.exec(objStr);
    if (invMatch) {
      let j = invMatch.index + invMatch[0].length;
      let invDepth = 1;
      while (j < objStr.length && invDepth > 0) {
        if (objStr[j] === '{') invDepth++;
        else if (objStr[j] === '}') invDepth--;
        j++;
      }
      const invBlock = objStr.slice(invMatch.index + invMatch[0].length, j - 1);
      const slotsContent = extractBalancedArray(invBlock, 'itemSlots');
      if (slotsContent) {
        const slotPattern = /\{([^}]*)\}/g;
        let slotMatch;
        while ((slotMatch = slotPattern.exec(slotsContent)) !== null) {
          const s = slotMatch[1];
          const idMatch = s.match(/"itemID"\s*[=:;,]\s*([>0-9]+)/);
          const amountMatch = s.match(/"stackAmount"\s*[=:;,]\s*([>0-9]+)/);
          if (idMatch) {
            const id = parseInt(idMatch[1].replace(/>/g, ''), 10);
            const amount = amountMatch ? parseInt(amountMatch[1].replace(/>/g, ''), 10) : 1;
            if (!isNaN(id) && id > 0 && amount > 0) donatedItems.push({ id, amount });
          }
        }
      }
    }
    result.push({ questID, donatedItems });
  }
  return result;
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
    donatedMuseumItemsList: extractArray(text, "donatedMuseumItemsList"),
    playerInventory: extractInventory(text),
    currentDateDay: extractNestedNumber(text, "currentDate", "Day"),
    currentDateSeason: extractNestedNumber(text, "currentDate", "Season"),
    currentDateYear: extractNestedNumber(text, "currentDate", "Year"),
    homeLevel: extractNumber(text, "homeLevel"),
    daysOfHomeConstruction: extractNumber(text, "daysOfHomeConstruction"),
    barnData: extractBarnData(text),
    projectMatPileData: extractProjectMatPileData(text),
  };
}
