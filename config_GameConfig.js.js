const GameConfig = {
  // Server
  SERVER_TICK_RATE: 60,
  INTERPOLATION_DELAY: 100,

  // World
  WORLD_SIZE: {
    width: 2000,
    height: 2000
  },

  // Player
  PLAYER_BASE_RADIUS: 8,
  PLAYER_ACCELERATION: 300,
  PLAYER_MAX_VELOCITY: 250,
  PLAYER_FRICTION: 0.08,
  PLAYER_MAX_HEALTH: 100,
  PLAYER_MAX_MANA: 100,
  ESSENCE_RADIUS_MULTIPLIER: 0.3,
  POSITION_UPDATE_THRESHOLD: 5,

  // Essences
  INITIAL_ESSENCE_COUNT: 1000,
  MIN_ESSENCE_COUNT: 500,
  ESSENCE_ATTRACTION_RANGE: 200,
  ESSENCE_ATTRACTION_FORCE: 50,
  ESSENCE_RADIUS: {
    common: 3,
    uncommon: 4,
    rare: 5,
    epic: 6,
    legendary: 8
  },

  // NPCs
  INITIAL_NPC_COUNT: 50,
  NPC_RADIUS: 6,
  NPC_HEALTH: 10,
  NPC_SPEED: 80,

  // Visibility
  VISIBILITY_DISTANCE: 1000,

  // Essence Types
  ESSENCE_TYPES: ['fire', 'water', 'earth', 'air', 'void', 'light', 'dark'],

  getRandomEssenceType() {
    return this.ESSENCE_TYPES[Math.floor(Math.random() * this.ESSENCE_TYPES.length)];
  }
};

module.exports = { GameConfig };