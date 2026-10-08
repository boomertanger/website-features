// The starter check-in word list (docs/specs/control-room.md §4): short, spoken-friendly HORROR words
// the owner says on stream. For the owner's review: grouped by theme, one comment per group.
//
// Rules every word follows (scripts/check-live.js enforces what it can):
// - one word, lowercase ASCII letters, 3 to 10 letters (4 to 10 except fog), easy to say and to hear
// - suitable for a 13+ audience: no slurs, nothing sexual, no real tragedies, atrocities or disasters,
//   no real brand or person names
// - NOT easily misheard as another word in the list or as a common word: no homophones or near-sounds
//   (so no crypt/script, grave/gray, haunt/hunt, blood/blud, witch/which, scream/stream, mummy/mommy,
//   night/knight, hearse AND horse, wail/whale, creak/creek ...). Owner-approved exceptions: ghost AND ghoul,
//   haunted, wraith, tomb, fog: say them clearly on stream.
// - distinct after normalise() (the same function logic.js uses for answers)
//
// To add or remove a word: edit the groups below; `npm run check` re-checks the rules.

const GROUPS = {
  // Places
  places: [
    "graveyard", "tomb",
    "mortuary", "morgue", "catacomb", "cellar", "attic", "dungeon", "mansion", "cemetery",
    "chapel", "belfry", "tunnel", "bunker", "mausoleum", "lighthouse", "cabin", "swamp", "marsh",
    "hollow", "laboratory", "basement", "hallway", "staircase", "cornfield", "cavern",
    "orchard", "boneyard", "rooftop", "elevator",
  ],
  // Creatures and characters
  creatures: [
    "ghoul", "wraith",
    "phantom", "banshee", "zombie", "vampire", "werewolf", "goblin", "gargoyle", "ghost",
    "skeleton", "demon", "reaper", "scarecrow", "revenant", "stalker", "monster",
    "beast", "spirit", "apparition", "spider", "raven", "centipede", "leech", "maggot",
    "locust", "scorpion", "vulture", "serpent", "kraken", "chimera", "jackal",
  ],
  // Objects and props
  objects: [
    "lantern", "candle", "coffin", "casket", "hearse", "tombstone", "headstone",
    "mask", "mirror", "doll", "puppet", "marionette", "potion",
    "amulet", "talisman", "pendulum", "skull", "locket", "chandelier",
    "trapdoor", "padlock", "shovel", "pitchfork", "torch", "sickle", "scythe", "pumpkin",
    "cobweb", "gramophone", "typewriter",
  ],
  // Rites, magic and omens
  rituals: [
    "ritual", "seance", "curse", "omen", "relic", "effigy",
    "sorcery", "conjure", "vigil", "oracle", "prophecy",
  ],
  // Mood and atmosphere
  mood: [
    "haunted",
    "shadow", "whisper", "shiver", "dread", "gloom", "eerie", "midnight", "twilight", "darkness",
    "silence", "nightmare", "terror", "panic", "shriek", "howl", "creepy", "sinister", "macabre",
    "ominous", "wicked", "possessed", "ghastly", "unholy", "chilling", "tremble", "forbidden",
    "restless", "lurking", "trapped", "vanished",
  ],
  // Weather, nature and the dark
  nature: [
    "fog",
    "thorn", "bramble", "thicket", "eclipse", "thunder", "lightning", "storm", "blizzard", "harvest",
    "venom", "poison", "crimson", "ember", "ashes", "bonfire", "decay", "rotten", "withered",
    "gnarled", "moonlit", "starless",
  ],
};

const WORDS = Object.freeze(Object.values(GROUPS).flat());

/** Same normalisation as live/logic.js (NFC, lowercase, letters and digits only; no accent stripping). */
const normalise = require("./logic").normalise;

module.exports = { GROUPS, WORDS, normalise };
