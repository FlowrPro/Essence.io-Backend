const { GameConfig } = require('../config/GameConfig');

class Player {
  constructor(id, name, clientId, x, y) {
    this.id = id;
    this.name = name;
    this.clientId = clientId;

    this.position = { x, y };
    this.velocity = { x: 0, y: 0 };
    this.rotation = 0;
    this.acceleration = GameConfig.PLAYER_ACCELERATION;
    this.maxVelocity = GameConfig.PLAYER_MAX_VELOCITY;
    this.friction = GameConfig.PLAYER_FRICTION;

    this.baseRadius = GameConfig.PLAYER_BASE_RADIUS;
    this.radius = this.baseRadius;
    this.essences = [];
    this.health = GameConfig.PLAYER_MAX_HEALTH;
    this.mana = GameConfig.PLAYER_MAX_MANA;

    this.inputState = {
      up: false,
      down: false,
      left: false,
      right: false
    };

    this.lastSignificantPosition = { ...this.position };
    this.lastPositionUpdateTime = Date.now();
  }

  updateVelocity(keys) {
    let accelX = 0;
    let accelY = 0;

    if (keys.includes('w') || keys.includes('ArrowUp')) accelY -= this.acceleration;
    if (keys.includes('s') || keys.includes('ArrowDown')) accelY += this.acceleration;
    if (keys.includes('a') || keys.includes('ArrowLeft')) accelX -= this.acceleration;
    if (keys.includes('d') || keys.includes('ArrowRight')) accelX += this.acceleration;

    const magnitude = Math.hypot(accelX, accelY);
    if (magnitude > 0) {
      accelX = (accelX / magnitude) * this.acceleration;
      accelY = (accelY / magnitude) * this.acceleration;
    }

    this.velocity.x += accelX / GameConfig.SERVER_TICK_RATE;
    this.velocity.y += accelY / GameConfig.SERVER_TICK_RATE;

    this.velocity.x *= (1 - this.friction);
    this.velocity.y *= (1 - this.friction);

    const velocityMagnitude = Math.hypot(this.velocity.x, this.velocity.y);
    if (velocityMagnitude > this.maxVelocity) {
      this.velocity.x = (this.velocity.x / velocityMagnitude) * this.maxVelocity;
      this.velocity.y = (this.velocity.y / velocityMagnitude) * this.maxVelocity;
    }

    if (velocityMagnitude > 0.1) {
      this.rotation = Math.atan2(this.velocity.y, this.velocity.x);
    }
  }

  update(deltaTime) {
    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;

    const worldSize = GameConfig.WORLD_SIZE;
    this.position.x = Math.max(this.radius, Math.min(worldSize.width - this.radius, this.position.x));
    this.position.y = Math.max(this.radius, Math.min(worldSize.height - this.radius, this.position.y));

    this.radius = this.baseRadius + (this.essences.length * GameConfig.ESSENCE_RADIUS_MULTIPLIER);

    const sizePenalty = Math.pow(this.essences.length / 100, 0.3);
    this.maxVelocity = GameConfig.PLAYER_MAX_VELOCITY * (1 - sizePenalty * 0.5);
  }

  addEssence(essence) {
    this.essences.push(essence);
  }

  hasMovedSignificantly() {
    const dx = this.position.x - this.lastSignificantPosition.x;
    const dy = this.position.y - this.lastSignificantPosition.y;
    const distance = Math.hypot(dx, dy);

    if (distance > GameConfig.POSITION_UPDATE_THRESHOLD) {
      this.lastSignificantPosition = { ...this.position };
      return true;
    }

    return false;
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
      name: this.name,
      position: this.position,
      velocity: this.velocity,
      rotation: this.rotation,
      radius: this.radius,
      essenceCount: this.essences.length,
      health: this.health
    };
  }
}

module.exports = { Player };
