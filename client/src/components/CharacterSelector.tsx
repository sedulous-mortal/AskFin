import { useAuth } from '../context/AuthContext';

const sampleCharacter = {
  id: 'sample',
  character_name: 'Sample Character',
};

export default function CharacterSelector() {
  const { characters, selectedCharacterId, setSelectedCharacterId } = useAuth();
  const hasCharacters = characters.length > 0;
  const options = hasCharacters ? characters : [sampleCharacter];
  const value = selectedCharacterId ?? options[0].id;
  const selectedCharacter = options.find((c) => c.id === value) || sampleCharacter;

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => setSelectedCharacterId(e.target.value)}
        className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        {options.map((character) => (
          <option key={character.id} value={character.id}>
            {character.character_name}
          </option>
        ))}
      </select>
    </div>
  );
}
