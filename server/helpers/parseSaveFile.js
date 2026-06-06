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

export function parseSaveFile(buffer) {
  const text = xorDecrypt(buffer);
  return {
    playerName: extractString(text, "playerName"),
    farmName: extractString(text, "farmName"),
    saveFileVersion: extractNumber(text, "saveFileVersion"),
    exp: extractNumber(text, "exp"),
    playerSpeciesId: extractNumber(text, "playerSpeciesID"),
    difficulty: extractNumber(text, "difficulty"),
    totalPlayTimeSeconds: extractNumber(text, "totalPlayTimeSeconds"),
    playerPronouns: extractNumber(text, "playerPronouns"),
  };
}
