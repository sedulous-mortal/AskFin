const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export type CharacterData = {
  playerName: string | null;
  saveFileVersion: number | null;
  exp: number | null;
  playerSpeciesId: number | null;
  difficulty: number | null;
  totalPlayTimeSeconds: number | null;
  playerPronouns: number | null;
};

export type ParseSaveResult = {
  character: CharacterData;
  saved: boolean;
  characterId?: string;
  error?: string;
};

export async function uploadSaveFile(file: File, userId: string | null): Promise<ParseSaveResult> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Convert binary to base64 in chunks to avoid call stack limits on large files.
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const fileData = btoa(binary);

  const response = await fetch(`${API_BASE}/api/save/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileData, userId }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error((body as { error?: string }).error || 'Failed to process save file.');
  }

  return body as ParseSaveResult;
}
