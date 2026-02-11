/**
 * App principal - Orquesta: Audio -> IA -> Combate -> UI
 */

import { AudioManager } from './audio-manager.js';
import { AIManager } from './ai-manager.js';
import { GameState } from './game-state.js';
import { CombatTracker } from './combat-tracker.js';

// Estado global
const gameState = new GameState();
const combatTracker = new CombatTracker();
const audioManager = new AudioManager();
const aiManager = new AIManager(gameState, combatTracker);
let activePlayer = null; // Último jugador que se identificó por voz

// Paleta de colores fantasy para diferenciar jugadores
const PLAYER_COLORS = [
  '#e74c3c',  // Rojo dragón
  '#3498db',  // Azul arcano
  '#2ecc71',  // Verde bosque
  '#e67e22',  // Naranja forja
  '#9b59b6',  // Púrpura hechizo
  '#1abc9c',  // Turquesa élfico
];

function getPlayerColor(playerName) {
  if (!playerName) return PLAYER_COLORS[0];
  const index = gameState.players.findIndex(
    p => p.name.toLowerCase() === playerName.toLowerCase()
  );
  return PLAYER_COLORS[(index === -1 ? 0 : index) % PLAYER_COLORS.length];
}

// Referencias DOM
const chat = document.getElementById('chat');
const micDot = document.getElementById('mic-dot');
const statusText = document.getElementById('status-text');
const textInput = document.getElementById('text-input');
const sendBtn = document.getElementById('send-btn');
const micToggle = document.getElementById('mic-toggle');
const saveBtn = document.getElementById('save-btn');
const loadBtn = document.getElementById('load-btn');
const resetBtn = document.getElementById('reset-btn');
const addPlayerBtn = document.getElementById('add-player-btn');
const addPlayerDialog = document.getElementById('add-player-dialog');
const playersList = document.getElementById('players-list');
const currentLocationEl = document.getElementById('current-location');
const currentQuestEl = document.getElementById('current-quest');
const combatPanel = document.getElementById('combat-panel');
const combatantsList = document.getElementById('combatants-list');
const roundNumber = document.getElementById('round-number');
const nextTurnBtn = document.getElementById('next-turn-btn');
const endCombatBtn = document.getElementById('end-combat-btn');
const diceLog = document.getElementById('dice-log');

// --- Callbacks ---

audioManager.onStatusChange = (status) => {
  micDot.className = 'mic-dot';
  switch (status) {
    case 'listening':
      micDot.classList.add('listening');
      statusText.textContent = 'Escuchando...';
      break;
    case 'processing':
      micDot.classList.add('processing');
      statusText.textContent = 'Procesando...';
      break;
    case 'speaking':
      micDot.classList.add('speaking');
      statusText.textContent = 'DM habla...';
      break;
    default:
      statusText.textContent = 'Pausado';
  }
};

audioManager.onTranscription = async (text) => {
  const masterRegex = /^m[aá]ster[,.\s:]*/i;

  // Si no empieza con "Master", mostrar como chatter y no enviar a la IA
  if (!masterRegex.test(text.trim())) {
    addMessage('chatter', text);
    return;
  }

  // Quitar el prefijo "Master"
  const cleaned = text.trim().replace(masterRegex, '').trim();
  if (!cleaned) return;

  // Comandos de voz especiales
  if (/^(espera|apaga el micro|un momento|silencio)/i.test(cleaned)) {
    if (!audioManager.isPaused) {
      audioManager.togglePause();
      micToggle.textContent = 'Activar Micro';
    }
    addMessage('dm', '🔇 Micro apagado. Usad el botón "Activar Micro" para reanudar.');
    return;
  }

  // Detectar nombre del jugador con varias formulaciones naturales
  const namePatterns = [
    /^soy\s+([\p{L}]+)/iu,
    /(?:me llamo|mi (?:personaje|nombre) (?:es|se llama))\s+([\p{L}]+)/iu,
  ];
  for (const pattern of namePatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      const spokenName = match[1];
      const player = gameState.players.find(
        p => p.name.toLowerCase() === spokenName.toLowerCase()
      );
      activePlayer = player ? player.name : spokenName;
      break;
    }
  }

  // Preparar mensaje para la IA con identificación de jugador
  const messageForAI = activePlayer ? `[${activePlayer}]: ${cleaned}` : cleaned;

  await handlePlayerInput(messageForAI);
};

aiManager.onStatusUpdate = ({ location, quest }) => {
  if (location) currentLocationEl.textContent = location;
  if (quest) currentQuestEl.textContent = quest;
};

aiManager.onResponse = (fullText, cleanText, tags) => {
  // Actualizar UI de combate si hay cambios
  const hasCombatTag = tags.some(t =>
    ['combat_start', 'combat_end', 'initiative', 'damage', 'heal'].includes(t.type)
  );
  if (hasCombatTag) renderCombat();

  // Registrar tiradas ocultas y eventos en el log lateral
  const logTags = tags.filter(t =>
    ['hidden_roll', 'dm_event'].includes(t.type)
  );
  for (const tag of logTags) {
    addDiceLogEntry(tag.groups[0]);
  }
};

// --- Funciones principales ---

async function handlePlayerInput(text) {
  addMessage('player', text);

  const { text: dmText, cleanText } = await aiManager.sendMessage(text);
  addMessage('dm', dmText);

  // Hablar la respuesta limpia (sin etiquetas)
  if (cleanText) {
    await audioManager.speak(cleanText);
  }
}

function addMessage(type, text) {
  const div = document.createElement('div');
  if (type === 'chatter') {
    div.className = 'message chatter-message';
  } else {
    div.className = `message ${type === 'dm' ? 'dm-message' : 'player-message'}`;
  }

  const author = document.createElement('span');
  author.className = 'message-author';
  author.textContent = type === 'dm' ? 'DM'
    : type === 'chatter' ? '💬'
    : activePlayer || 'Jugador';

  // Aplicar color único por jugador
  if (type === 'player' && activePlayer) {
    const color = getPlayerColor(activePlayer);
    author.style.color = color;
    div.style.borderLeftColor = color;
  }

  const content = document.createElement('p');
  // Formatear: convertir etiquetas en texto visual
  content.innerHTML = formatMessage(text);

  div.appendChild(author);
  div.appendChild(content);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function formatMessage(text) {
  return text
    .replace(/\[DM_PIENSA:\s*(.+?)\]/g, '<div class="dm-internal dm-thinks">🧠 $1</div>')
    .replace(/\[DM_EVENTO:\s*(.+?)\]/g, '<div class="dm-internal dm-event">👁️ $1</div>')
    .replace(/\[TIRADA_OCULTA:\s*(.+?)\]/g, '<div class="dm-internal dm-roll">🎲 $1</div>')
    .replace(/\[COMBATE_INICIO\]/g, '<strong style="color:var(--accent)">⚔️ ¡Combate!</strong>')
    .replace(/\[COMBATE_FIN\]/g, '<strong style="color:var(--success)">✅ Combate terminado</strong>')
    .replace(/\[INICIATIVA:\s*(.+?)\]/g, '<em style="color:var(--text-dim)">📋 Iniciativa: $1</em>')
    .replace(/\[DANO:\s*(.+?)\]/g, '<em style="color:var(--danger)">💥 $1</em>')
    .replace(/\[CURACION:\s*(.+?)\]/g, '<em style="color:var(--success)">💚 $1</em>')
    .replace(/\[UBICACION:\s*(.+?)\]/g, '<em style="color:var(--gold)">📍 $1</em>')
    .replace(/\[MISION:\s*(.+?)\]/g, '<em style="color:var(--gold)">📜 $1</em>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

// --- UI de Combate ---

function renderCombat() {
  if (combatTracker.active) {
    combatPanel.style.display = '';
    roundNumber.textContent = combatTracker.round;

    combatantsList.innerHTML = combatTracker.combatants.map((c, i) => {
      const isActive = i === combatTracker.turnIndex;
      const hpPercent = Math.round((c.hp / c.maxHp) * 100);
      const hpClass = hpPercent <= 25 ? 'critical' : hpPercent <= 50 ? 'low' : '';
      const typeClass = c.isPlayer ? 'ally' : 'enemy';

      return `
        <div class="combatant-row ${typeClass} ${isActive ? 'active-turn' : ''}">
          <div>
            <strong>${c.initiative}</strong> ${c.name}
            ${c.conditions.length ? `<small>[${c.conditions.join(', ')}]</small>` : ''}
          </div>
          <div>
            ${c.alive ? `${c.hp}/${c.maxHp} HP` : '<span style="color:var(--danger)">Derrotado</span>'}
            <div class="hp-bar"><div class="hp-bar-fill ${hpClass}" style="width:${hpPercent}%"></div></div>
          </div>
        </div>
      `;
    }).join('');
  } else {
    combatPanel.style.display = 'none';
  }
}

// --- UI de Jugadores ---

function renderPlayers() {
  playersList.innerHTML = gameState.players.map((p, index) => {
    const hpPercent = Math.round((p.hp / p.maxHp) * 100);
    const hpClass = hpPercent <= 25 ? 'critical' : hpPercent <= 50 ? 'low' : '';
    const color = PLAYER_COLORS[index % PLAYER_COLORS.length];
    return `
      <div class="player-card" style="border-left: 3px solid ${color}">
        <div>
          <div class="player-name" style="color: ${color}">${p.name}</div>
          <div class="player-info">${p.class} Nv.${p.level} | CA ${p.ac}</div>
          <div class="hp-bar"><div class="hp-bar-fill ${hpClass}" style="width:${hpPercent}%"></div></div>
        </div>
        <div style="font-size:0.8rem">${p.hp}/${p.maxHp}</div>
      </div>
    `;
  }).join('');
}

function addDiceLogEntry(text) {
  const entry = document.createElement('div');
  entry.className = 'dice-entry';
  entry.innerHTML = `<span class="dice-result">🎲</span> ${text}`;
  diceLog.prepend(entry);

  // Limitar a 20 entradas
  while (diceLog.children.length > 20) {
    diceLog.removeChild(diceLog.lastChild);
  }
}

// --- Event Listeners ---

// Enviar texto manualmente
sendBtn.addEventListener('click', () => {
  const text = textInput.value.trim();
  if (text) {
    textInput.value = '';
    handlePlayerInput(text);
  }
});

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendBtn.click();
});

// Toggle micro
micToggle.addEventListener('click', () => {
  const paused = audioManager.togglePause();
  micToggle.textContent = paused ? 'Activar Micro' : 'Pausar Micro';
});

// Guardar / Cargar
saveBtn.addEventListener('click', () => {
  gameState.save();
  addMessage('dm', '💾 Partida guardada.');
});

loadBtn.addEventListener('click', () => {
  if (gameState.hasSavedGame()) {
    gameState.load();
    renderPlayers();
    currentLocationEl.textContent = gameState.location;
    currentQuestEl.textContent = gameState.quest;
    addMessage('dm', '📂 Partida cargada. Continuemos donde lo dejamos...');
  } else {
    addMessage('dm', 'No hay partida guardada.');
  }
});

// Reiniciar partida
resetBtn.addEventListener('click', () => {
  if (confirm('¿Seguro que quieres reiniciar? Se perdera todo el progreso.')) {
    gameState.reset();
    combatTracker.endCombat();
    activePlayer = null;
    renderPlayers();
    renderCombat();
    currentLocationEl.textContent = gameState.location;
    currentQuestEl.textContent = gameState.quest;
    chat.innerHTML = '';
    addMessage('dm', '🔄 Partida reiniciada.');
    const welcome = aiManager.getWelcomePrompt();
    addMessage('dm', welcome);
  }
});

// Añadir jugador
addPlayerBtn.addEventListener('click', () => {
  addPlayerDialog.showModal();
});

addPlayerDialog.addEventListener('close', () => {
  if (addPlayerDialog.returnValue === 'confirm') {
    const name = document.getElementById('player-name').value.trim();
    const cls = document.getElementById('player-class').value;
    const level = parseInt(document.getElementById('player-level').value) || 1;
    const hp = parseInt(document.getElementById('player-hp').value) || 10;
    const ac = parseInt(document.getElementById('player-ac').value) || 10;

    if (name) {
      gameState.addPlayer(name, cls, level, hp, ac);
      renderPlayers();
    }
  }
});

// Combate
nextTurnBtn.addEventListener('click', () => {
  const next = combatTracker.nextTurn();
  if (next) {
    renderCombat();
    addMessage('dm', `Turno de ${next.name} (HP: ${next.hp}/${next.maxHp})`);
  }
});

endCombatBtn.addEventListener('click', () => {
  combatTracker.endCombat();
  renderCombat();
  addMessage('dm', '⚔️ Combate finalizado.');
});

// Auto-guardado cada 30 segundos
setInterval(() => gameState.save(), 30000);

// --- Inicializacion ---

async function init() {
  // Cargar partida guardada si existe
  if (gameState.hasSavedGame()) {
    gameState.load();
    renderPlayers();
    currentLocationEl.textContent = gameState.location;
    currentQuestEl.textContent = gameState.quest;
  }

  // Cargar aventura y DMG
  const loaded = await aiManager.loadAdventure();

  // Limpiar chat y mostrar estado de carga
  chat.innerHTML = '';
  if (loaded.adventure) {
    addMessage('dm', '📖 Aventura cargada: La Mina Perdida de Phandelver');
  } else {
    addMessage('dm', '⚠️ Aventura no encontrada. Ejecuta: python3 scripts/extract-pdf.py "tu-aventura.pdf" adventure');
  }
  if (loaded.dmg) {
    addMessage('dm', '📕 Guia del Dungeon Master cargada como referencia de reglas.');
  }
  if (loaded.phb) {
    addMessage('dm', '📗 Manual del Jugador cargado como referencia de reglas.');
  }

  // Mensaje de bienvenida del DM
  const welcome = aiManager.getWelcomePrompt();
  addMessage('dm', welcome);

  // Inicializar audio (empieza pausado para evitar gasto en Whisper)
  const audioOk = await audioManager.initialize();
  if (audioOk) {
    audioManager.togglePause();
    micToggle.textContent = 'Activar Micro';
  } else {
    addMessage('dm', '⚠️ No se pudo acceder al microfono. Usa el campo de texto para interactuar.');
    statusText.textContent = 'Sin microfono';
  }
}

init();
