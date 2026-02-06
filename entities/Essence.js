const { GameConfig } = require('../config/GameConfig');

class Essence {
  constructor(id, x, y, type) {
    this.id = id;
    this.position = { x, y };
    this.velocity = { x: 0, y: 0 };
    this.type = type;
    this.rarity = this.getRandomRarity();
    this.level = 1;
    this.radius = GameConfig.ESSENCE_RADIUS[this.rarity] || 3;
    this.creationTime = Date.now();
  }

  getRandomRarity() {
    const rand = Math.random();
    if (rand < 0.50) return 'common';
    if (rand < 0.80) return 'uncommon';
    if (rand < 0.95) return 'rare';
    if (rand < 0.99) return 'epic';
    return 'legendary';
  }

  update(deltaTime) {
    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;

    this.velocity.x *= 0.95;
    this.velocity.y *= 0.95;

    const worldSize = GameConfig.WORLD_SIZE;
    this.position.x = Math.max(0, Math.min(worldSize.width, this.position.x));
    this.position.y = Math.max(0, Math.min(worldSize.height, this.position.y));
  }

  getBounds() {
    return {
      x: this.position.x - this.radius,
      y: this.position.y - this.radius,
      width: this.radius * 2,
      height: this.radius * 2
    };
  }

  getPublicData() {
    return {
      id: this.id,
      position: this.position,
      type: this.type,
      rarity: this.rarity,
      level: this.level,
      radius: this.radius
    };
  }
}

module.exports = { Essence };
