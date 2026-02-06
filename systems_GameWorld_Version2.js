const { Quadtree } = require('../utils/Quadtree');
const { Player } = require('../entities/Player');
const { Essence } = require('../entities/Essence');
const { NPC } = require('../entities/NPC');
const { GameConfig } = require('../config/GameConfig');

class GameWorld {
  constructor() {
    this.players = new Map();
    this.essences = new Map();
    this.npcs = new Map();
    
    this.tick = 0;
    this.lastUpdateTime = Date.now();
    
    this.quadtree = new Quadtree({
      x: 0,
      y: 0,
      width: GameConfig.WORLD_SIZE.width,
      height: GameConfig.WORLD_SIZE.height
    }, 4, 8);

    this.entityIdCounter = 0;
    this.deltaUpdates = [];

    this.initializeWorld();
  }

  initializeWorld() {
    for (let i = 0; i < GameConfig.INITIAL_ESSENCE_COUNT; i++) {
      this.spawnEssence(
        Math.random() * GameConfig.WORLD_SIZE.width,
        Math.random() * GameConfig.WORLD_SIZE.height
      );
    }

    for (let i = 0; i < GameConfig.INITIAL_NPC_COUNT; i++) {
      const x = Math.random() * GameConfig.WORLD_SIZE.width;
      const y = Math.random() * GameConfig.WORLD_SIZE.height;
      this.spawnNPC(x, y);
    }

    console.log(`[WORLD] Initialized with ${GameConfig.INITIAL_ESSENCE_COUNT} essences and ${GameConfig.INITIAL_NPC_COUNT} NPCs`);
  }

  addPlayer(clientId, playerName) {
    const player = new Player(
      this.getNextEntityId(),
      playerName,
      clientId,
      GameConfig.WORLD_SIZE.width / 2,
      GameConfig.WORLD_SIZE.height / 2
    );

    this.players.set(player.id, player);
    this.deltaUpdates.push({
      type: 'playerAdded',
      entity: player,
      timestamp: Date.now()
    });

    return player;
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      this.players.delete(playerId);
      this.deltaUpdates.push({
        type: 'playerRemoved',
        entityId: playerId,
        timestamp: Date.now()
      });
    }
  }

  spawnEssence(x, y) {
    const essence = new Essence(
      this.getNextEntityId(),
      x,
      y,
      GameConfig.getRandomEssenceType()
    );

    this.essences.set(essence.id, essence);
    this.deltaUpdates.push({
      type: 'essenceAdded',
      entity: essence,
      timestamp: Date.now()
    });

    return essence;
  }

  spawnNPC(x, y) {
    const npc = new NPC(
      this.getNextEntityId(),
      x,
      y
    );

    this.npcs.set(npc.id, npc);
    this.deltaUpdates.push({
      type: 'npcAdded',
      entity: npc,
      timestamp: Date.now()
    });

    return npc;
  }

  getNextEntityId() {
    return `entity_${++this.entityIdCounter}`;
  }

  processPlayerInput(playerId, input) {
    const player = this.players.get(playerId);
    if (!player) return;

    player.updateVelocity(input.keys || []);
  }

  update(deltaTime) {
    this.tick++;
    this.deltaUpdates = [];

    this.players.forEach((player) => {
      player.update(deltaTime);
      this.trackDelta(player);
    });

    this.npcs.forEach((npc) => {
      npc.update(deltaTime);
      this.trackDelta(npc);
    });

    this.essences.forEach((essence) => {
      essence.update(deltaTime);
    });

    this.updateEssenceAttraction();
    this.handleCollisions();
    this.checkEssenceRespawn();
    this.rebuildQuadtree();
  }

  trackDelta(entity) {
    if (entity.hasMovedSignificantly && entity.hasMovedSignificantly()) {
      this.deltaUpdates.push({
        type: 'entityMoved',
        entity: {
          id: entity.id,
          position: entity.position,
          velocity: entity.velocity,
          rotation: entity.rotation
        },
        timestamp: Date.now()
      });
    }
  }

  updateEssenceAttraction() {
    this.players.forEach((player) => {
      const nearbyEssences = this.quadtree.search({
        x: player.position.x - GameConfig.ESSENCE_ATTRACTION_RANGE,
        y: player.position.y - GameConfig.ESSENCE_ATTRACTION_RANGE,
        width: GameConfig.ESSENCE_ATTRACTION_RANGE * 2,
        height: GameConfig.ESSENCE_ATTRACTION_RANGE * 2
      });

      nearbyEssences.forEach((essenceId) => {
        const essence = this.essences.get(essenceId);
        if (!essence) return;

        const dx = player.position.x - essence.position.x;
        const dy = player.position.y - essence.position.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0) {
          const attractionForce = GameConfig.ESSENCE_ATTRACTION_FORCE / (distance + 1);
          essence.velocity.x += (dx / distance) * attractionForce;
          essence.velocity.y += (dy / distance) * attractionForce;
        }

        if (distance < player.radius + essence.radius) {
          player.addEssence(essence);
          this.essences.delete(essence.id);
          this.deltaUpdates.push({
            type: 'essenceCollected',
            playerId: player.id,
            essenceId: essence.id,
            essenceCount: player.essences.length,
            timestamp: Date.now()
          });

          this.spawnEssence(
            Math.random() * GameConfig.WORLD_SIZE.width,
            Math.random() * GameConfig.WORLD_SIZE.height
          );
        }
      });
    });
  }

  handleCollisions() {
    const allEntities = [
      ...Array.from(this.players.values()),
      ...Array.from(this.npcs.values())
    ];

    for (let i = 0; i < allEntities.length; i++) {
      for (let j = i + 1; j < allEntities.length; j++) {
        const entity1 = allEntities[i];
        const entity2 = allEntities[j];

        if (this.checkAABBCollision(entity1, entity2)) {
          this.resolveCollision(entity1, entity2);
        }
      }
    }
  }

  checkAABBCollision(entity1, entity2) {
    const dx = entity2.position.x - entity1.position.x;
    const dy = entity2.position.y - entity1.position.y;
    const distance = Math.hypot(dx, dy);
    
    return distance < (entity1.radius + entity2.radius);
  }

  resolveCollision(entity1, entity2) {
    const dx = entity2.position.x - entity1.position.x;
    const dy = entity2.position.y - entity1.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 0) {
      const overlap = (entity1.radius + entity2.radius - distance) / 2;
      const separationX = (dx / distance) * overlap;
      const separationY = (dy / distance) * overlap;

      entity1.position.x -= separationX;
      entity1.position.y -= separationY;
      entity2.position.x += separationX;
      entity2.position.y += separationY;
    }
  }

  checkEssenceRespawn() {
    if (this.essences.size < GameConfig.MIN_ESSENCE_COUNT) {
      const needed = GameConfig.MIN_ESSENCE_COUNT - this.essences.size;
      for (let i = 0; i < needed; i++) {
        this.spawnEssence(
          Math.random() * GameConfig.WORLD_SIZE.width,
          Math.random() * GameConfig.WORLD_SIZE.height
        );
      }
    }
  }

  rebuildQuadtree() {
    this.quadtree.clear();

    this.players.forEach((player) => {
      this.quadtree.insert(player.id, player.getBounds());
    });

    this.essences.forEach((essence) => {
      this.quadtree.insert(essence.id, essence.getBounds());
    });

    this.npcs.forEach((npc) => {
      this.quadtree.insert(npc.id, npc.getBounds());
    });
  }

  getWorldSnapshot(playerId) {
    const player = this.players.get(playerId);
    return {
      tick: this.tick,
      clientId: playerId,
      players: Array.from(this.players.values()).map(p => p.getPublicData()),
      essences: Array.from(this.essences.values()).map(e => e.getPublicData()),
      npcs: Array.from(this.npcs.values()).map(n => n.getPublicData())
    };
  }

  getDeltaUpdates() {
    return this.deltaUpdates;
  }
}

module.exports = { GameWorld };