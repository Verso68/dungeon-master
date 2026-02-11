/** Sistema de combate: iniciativa, turnos, HP, condiciones */

import * as dice from './dice-roller.js';

export class CombatTracker {
  constructor() {
    this.active = false;
    this.round = 1;
    this.turnIndex = 0;
    this.combatants = [];
    this.log = [];
  }

  startCombat() {
    this.active = true;
    this.round = 1;
    this.turnIndex = 0;
    this.combatants = [];
    this.log = [];
  }

  endCombat() {
    this.active = false;
    this.combatants = [];
    this.round = 1;
    this.turnIndex = 0;
  }

  addCombatant({ name, initiative, hp, maxHp, ac, isPlayer = false }) {
    this.combatants.push({
      id: crypto.randomUUID(),
      name,
      initiative,
      hp,
      maxHp: maxHp || hp,
      ac: ac || 10,
      isPlayer,
      conditions: [],
      alive: true,
    });
    this.sortByInitiative();
  }

  sortByInitiative() {
    this.combatants.sort((a, b) => b.initiative - a.initiative);
  }

  nextTurn() {
    if (this.combatants.length === 0) return null;

    // Avanzar al siguiente combatiente vivo
    let attempts = 0;
    do {
      this.turnIndex++;
      if (this.turnIndex >= this.combatants.length) {
        this.turnIndex = 0;
        this.round++;
      }
      attempts++;
    } while (!this.combatants[this.turnIndex].alive && attempts < this.combatants.length);

    return this.getCurrentCombatant();
  }

  getCurrentCombatant() {
    return this.combatants[this.turnIndex] || null;
  }

  applyDamage(combatantId, damage) {
    const c = this.combatants.find(x => x.id === combatantId);
    if (!c) return null;

    c.hp = Math.max(0, c.hp - damage);
    if (c.hp === 0) c.alive = false;

    const entry = `${c.name} recibe ${damage} de dano (HP: ${c.hp}/${c.maxHp})`;
    this.log.push(entry);
    return { combatant: c, entry };
  }

  healCombatant(combatantId, amount) {
    const c = this.combatants.find(x => x.id === combatantId);
    if (!c) return null;

    c.hp = Math.min(c.maxHp, c.hp + amount);
    if (c.hp > 0) c.alive = true;

    const entry = `${c.name} recupera ${amount} HP (HP: ${c.hp}/${c.maxHp})`;
    this.log.push(entry);
    return { combatant: c, entry };
  }

  addCondition(combatantId, condition) {
    const c = this.combatants.find(x => x.id === combatantId);
    if (c && !c.conditions.includes(condition)) {
      c.conditions.push(condition);
    }
  }

  removeCondition(combatantId, condition) {
    const c = this.combatants.find(x => x.id === combatantId);
    if (c) {
      c.conditions = c.conditions.filter(x => x !== condition);
    }
  }

  /** Tirada oculta del DM - devuelve resultado sin mostrarlo a jugadores */
  hiddenRoll(description, sides = 20, modifier = 0) {
    const result = dice.roll(sides, 1, modifier);
    const entry = {
      description,
      result: result.total,
      detail: `${result.rolls[0]}${modifier ? (modifier > 0 ? '+' : '') + modifier : ''} = ${result.total}`,
      timestamp: Date.now(),
    };
    this.log.push(`[OCULTO] ${description}: ${entry.detail}`);
    return entry;
  }

  getCombatSummary() {
    if (!this.active) return 'No hay combate activo.';

    const current = this.getCurrentCombatant();
    const lines = [
      `Ronda ${this.round} - Turno de ${current?.name || '?'}`,
      '---',
    ];
    for (const c of this.combatants) {
      const marker = c === current ? '>> ' : '   ';
      const status = c.alive ? `HP: ${c.hp}/${c.maxHp}` : 'DERROTADO';
      const conds = c.conditions.length > 0 ? ` [${c.conditions.join(', ')}]` : '';
      lines.push(`${marker}${c.initiative} - ${c.name} (${status}, CA: ${c.ac})${conds}`);
    }
    return lines.join('\n');
  }

  getAliveCombatants() {
    return this.combatants.filter(c => c.alive);
  }

  isFinished() {
    const aliveEnemies = this.combatants.filter(c => !c.isPlayer && c.alive);
    const alivePlayers = this.combatants.filter(c => c.isPlayer && c.alive);
    return aliveEnemies.length === 0 || alivePlayers.length === 0;
  }
}
