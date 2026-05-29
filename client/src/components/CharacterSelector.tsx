import { useAuth } from '../context/AuthContext';

export default function CharacterSelector() {
  const { characters, selectedCharacterId, setSelectedCharacterId } = useAuth();

  if (characters.length === 0) {
    return null;
  }

  const selectedCharacter = characters.find((c) => c.id === selectedCharacterId);

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedCharacterId || ''}
        onChange={(e) => setSelectedCharacterId(e.target.value)}
        className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        {characters.map((character) => (
          <option key={character.id} value={character.id}>
            {character.character_name}
          </option>
        ))}
      </select>
      <span className="text-sm text-gray-600">
        {selectedCharacter && `Playing as ${selectedCharacter.character_name}`}
      </span>
    </div>
  );
}
