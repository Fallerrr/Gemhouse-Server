// EntityManager.js
import { ENTITY_TYPES } from "./config.js";

export class EntityManager {
  constructor() {
    this.entities = new Map(); // id -> instance
    this.types = ENTITY_TYPES;
  }

  spawn(type, id, data = {}) {
    const Ctor = this.types[type];
    if (!Ctor) throw new Error(`Unknown entity type: ${type}`);
    const { position, angle, hp, direction } = data;
    let instance;
    if (type === "player") {
      instance = new Ctor(id, position, angle ?? 0, hp ?? 3);
    } else if (type === "bullet") {
      instance = new Ctor(id, position, direction);
    } else {
      instance = new Ctor(id, position, angle ?? 0, data.vector ?? {x:0,y:0});
    }
    this.entities.set(id, instance);
    // attach visual if available
    const comps = instance.getSpriteComponents?.();
    if (comps) {
      instance.spriteRef = add(comps);
    }
    return instance;
  }

  despawn(id) {
    const ent = this.entities.get(id);
    if (!ent) return;
    if (ent.spriteRef) ent.spriteRef.destroy();
    this.entities.delete(id);
  }

  get(id) { return this.entities.get(id); }
  has(id) { return this.entities.has(id); }

  rekey(oldId, newId) {
    if (!this.entities.has(oldId) || oldId === newId) return this.entities.get(newId) || null;
    const ent = this.entities.get(oldId);
    this.entities.delete(oldId);
    ent.id = newId;
    this.entities.set(newId, ent);
    return ent;
  }

  updateAll(dt) {
    for (const ent of this.entities.values()) {
      if (ent.update) ent.update(dt);
    }
  }
}
