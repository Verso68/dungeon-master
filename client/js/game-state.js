/** Gestión del estado de juego con persistencia en localStorage */

const STORAGE_KEY = 'dnd-dm-game-state';

export class GameState {
  constructor() {
    this.players = [];
    this.location = 'Inicio de la aventura';
    this.quest = 'Por determinar';
    this.conversationHistory = [];
    this.adventureText = '';
    this.progress = {
      chapter: 1,
      completedQuests: [],
      discoveredLocations: [],
      metNPCs: [],
    };
  }

  addPlayer(name, characterClass, level, hp, ac) {
    const player = {
      id: crypto.randomUUID(),
      name,
      class: characterClass,
      level,
      hp,
      maxHp: hp,
      ac,
      conditions: [],
    };
    this.players.push(player);
    this.save();
    return player;
  }

  removePlayer(id) {
    this.players = this.players.filter(p => p.id !== id);
    this.save();
  }

  updatePlayerHP(id, newHp) {
    const player = this.players.find(p => p.id === id);
    if (player) {
      player.hp = Math.max(0, Math.min(newHp, player.maxHp));
      this.save();
    }
  }

  addMessage(role, content) {
    this.conversationHistory.push({
      role,
      content,
      timestamp: Date.now(),
    });
    // Mantener solo los ultimos 50 mensajes
    if (this.conversationHistory.length > 50) {
      this.conversationHistory = this.conversationHistory.slice(-50);
    }
    this.save();
  }

  getRecentMessages(count = 15) {
    return this.conversationHistory.slice(-count);
  }

  updateLocation(location) {
    this.location = location;
    if (!this.progress.discoveredLocations.includes(location)) {
      this.progress.discoveredLocations.push(location);
    }
    this.save();
  }

  updateQuest(quest) {
    this.quest = quest;
    this.save();
  }

  save() {
    try {
      const data = {
        players: this.players,
        location: this.location,
        quest: this.quest,
        conversationHistory: this.conversationHistory,
        progress: this.progress,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Error guardando estado:', e);
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      Object.assign(this, data);
      return true;
    } catch (e) {
      console.warn('Error cargando estado:', e);
      return false;
    }
  }

  hasSavedGame() {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }

  reset() {
    localStorage.removeItem(STORAGE_KEY);
    this.players = [];
    this.location = 'Inicio de la aventura';
    this.quest = 'Por determinar';
    this.conversationHistory = [];
    this.progress = {
      chapter: 1,
      completedQuests: [],
      discoveredLocations: [],
      metNPCs: [],
    };
  }

  getPlayersSummary() {
    if (this.players.length === 0) return 'No hay jugadores registrados.';
    return this.players.map(p =>
      `${p.name} (${p.class} Nv.${p.level}, HP: ${p.hp}/${p.maxHp}, CA: ${p.ac})`
    ).join(', ');
  }
}
