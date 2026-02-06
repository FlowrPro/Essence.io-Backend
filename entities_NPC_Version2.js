const { GameConfig } = require('../config/GameConfig');

class NPC {
  constructor(id, x, y) {
    this.id = id;
    this.position = { x, y };
    this.velocity = { x: 0, y: 0 };
    this.rotation = 0;
    this.radius = GameConfig.NPC_RADIUS;
    this.health = GameConfig.NPC_HEALTH;
    this.maxHealth = GameConfig.NPC_HEALTH;
    this.speed = GameConfig.NPC_SPEED;
    
    this.aiTimer = 0;
    this.aiUpdateInterval = 1 + Math.random() * 2;
    this.targetVelocity = { x: 0, y: 0 };
  }

  update(deltaTime) {
    this.aiTimer += deltaTime;

    if (this.aiTimer >= this.aiUpdateInterval) {
      this.aiTimer = 0;
      const angle = Math.random() * Math.PI * 2;
      this.targetVelocity.x = Math.cos(angle) * this.speed;
      this.targetVelocity.y = Math.sin(angle) * this.speed;
      this.aiUpdateInterval = 1 + Math.random() * 2;
    }

    this.velocity.x += (this.targetVelocity.x - this.velocity.x) * 0.1;
    this.velocity.y += (this.targetVelocity.y - this.velocity.y) * 0.1;

    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;

    const worldSize = GameConfig.WORLD_SIZE;
    if (this.position.x < -this.radius) this.position.x = worldSize.width + this.radius;
    if (this.position.x > worldSize.width + this.radius) this.position.x = -this.radius;
    if (this.position.y < -this.radius) this.position.y = worldSize.height + this.radius;
    if (this.position.y > worldSize.height + this.radius) this.position.y = -this.radius;

    const magnitude = Math.hypot(this.velocity.x, this.velocity.y);
    if (magnitude > 0.1) {
      this.rotation = Math.atan2(this.velocity.y, this.velocity.x);
    }
  }

  takeDamage(amount) {
    this.health -= amount;
    return this.health <= 0;
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
      rotation: this.rotation,
      radius: this.radius,
      health: this.health,
      maxHealth: this.maxHealth
    };
  }
}

module.exports = { NPC };