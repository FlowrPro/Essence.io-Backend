class Quadtree {
  constructor(bounds, maxEntities = 4, maxDepth = 8, depth = 0) {
    this.bounds = bounds;
    this.maxEntities = maxEntities;
    this.maxDepth = maxDepth;
    this.depth = depth;
    this.entities = new Map();
    this.divided = false;
    this.children = null;
  }

  insert(id, bounds) {
    if (!this.intersects(this.bounds, bounds)) {
      return false;
    }

    if (this.entities.size < this.maxEntities || this.depth >= this.maxDepth) {
      this.entities.set(id, bounds);
      return true;
    }

    if (!this.divided) {
      this.subdivide();
    }

    for (let child of this.children) {
      if (child.insert(id, bounds)) {
        return true;
      }
    }

    return false;
  }

  search(searchBounds) {
    const found = [];

    if (!this.intersects(this.bounds, searchBounds)) {
      return found;
    }

    for (let [id] of this.entities) {
      found.push(id);
    }

    if (this.divided) {
      for (let child of this.children) {
        found.push(...child.search(searchBounds));
      }
    }

    return found;
  }

  subdivide() {
    const x = this.bounds.x;
    const y = this.bounds.y;
    const w = this.bounds.width / 2;
    const h = this.bounds.height / 2;
    const d = this.depth + 1;

    this.children = [
      new Quadtree({ x: x, y: y, width: w, height: h }, this.maxEntities, this.maxDepth, d),
      new Quadtree({ x: x + w, y: y, width: w, height: h }, this.maxEntities, this.maxDepth, d),
      new Quadtree({ x: x, y: y + h, width: w, height: h }, this.maxEntities, this.maxDepth, d),
      new Quadtree({ x: x + w, y: y + h, width: w, height: h }, this.maxEntities, this.maxDepth, d)
    ];

    this.divided = true;
  }

  intersects(rect1, rect2) {
    return !(rect2.x > rect1.x + rect1.width ||
             rect2.x + rect2.width < rect1.x ||
             rect2.y > rect1.y + rect1.height ||
             rect2.y + rect2.height < rect1.y);
  }

  clear() {
    this.entities.clear();
    this.divided = false;
    this.children = null;
  }
}

module.exports = { Quadtree };
