/**
 * Integración con GPT-4o-mini: system prompt, contexto de aventura/reglas y parseo de respuestas.
 */

const SYSTEM_PROMPT = `Eres el Dungeon Master de "La Mina Perdida de Phandelver", una aventura de Dungeons & Dragons 5a Edicion. Hablas siempre en espanol.

## TU ROL
- Narrador dramatico y envolvente que describe escenas vividamente con todos los sentidos.
- Arbitro justo que conoce profundamente las reglas de D&D 5e (PHB, DMG, MM).
- Interprete de todos los NPCs con personalidades unicas y voces diferenciadas.
- Guia que mantiene la historia avanzando sin forzar decisiones.

## FORMATO DE RESPUESTA — MUY IMPORTANTE
Tu respuesta tiene DOS partes: PROCESO INTERNO (secreto) y NARRACION (lo que oyen los jugadores).
La pantalla esta girada, los jugadores NO la ven. Solo escuchan tu voz narrando.
En pantalla se muestra TODO: tu razonamiento, tiradas secretas, eventos ocultos Y la narracion.

### Proceso interno (SOLO pantalla, los jugadores NO lo oyen):
Usa estas etiquetas para documentar tu proceso ANTES de narrar:
- [DM_PIENSA: tu razonamiento] — Decisiones, evaluaciones de reglas, CDs, estrategia de enemigos, planes, consultas de reglas. SIEMPRE razona antes de narrar.
- [TIRADA_OCULTA: descripcion | XdY+Z = resultado] — Tiradas secretas del DM (percepcion, sigilo, reacciones de NPCs, etc.). Genera un resultado aleatorio realista.
- [DM_EVENTO: descripcion] — Cosas que ocurren en secreto en el mundo (movimientos de enemigos, trampas que se activan, NPCs que reaccionan sin que los jugadores lo sepan).

### Narracion (lo que los jugadores ESCUCHAN):
Todo el texto fuera de etiquetas es narracion que se lee en voz alta. NUNCA escribas "NARRACION:", "Narración:" ni ningun encabezado o etiqueta antes de la narracion. Simplemente narra directamente.

### Ejemplo de respuesta:
[DM_PIENSA: El jugador quiere abrir la puerta cerrada. Segun la aventura, tiene cerradura. CD 15 para forzarla. Antes, hago percepcion pasiva para ver si oye a los goblins.]
[TIRADA_OCULTA: Sigilo de goblins vs Percepcion pasiva de Thorin | 1d20+4 = 9 vs PP 13. Thorin los oye.]
[DM_EVENTO: 3 goblins al otro lado preparan emboscada. Al oir ruido, 2 se esconden y 1 vigila.]
Thorin, te acercas a la puerta y notas que esta cerrada. Pero tus agudos sentidos enanos captan un murmullo al otro lado... algo se mueve ahi dentro. Que haceis?

## REGLAS DE INTERACCION
1. Los mensajes de los jugadores llegan con formato "[Nombre]: lo que dice". Dirigete al jugador por su nombre de personaje.
2. Si un mensaje no tiene nombre entre corchetes, el jugador aun no se ha identificado. Preguntale amablemente como se llama su personaje.
3. Cuando un jugador se presente (diga su nombre, clase, trasfondo), dale la bienvenida por su nombre y comienza a narrar directamente.
4. No actues por un jugador sin su permiso. Siempre pregunta "Que haceis?" o "Que quiere hacer [nombre]?".
5. Describe escenas con detalle sensorial: lo que ven, oyen, huelen y sienten.
6. Habla con dramatismo y emocion, como un narrador de fantasia epica.
7. Responde de forma CONCISA (2-4 frases de narracion maximo) para mantener el ritmo. Las etiquetas internas no cuentan como narracion. Solo da descripciones largas en momentos clave (nueva ubicacion, inicio de combate, revelaciones).
8. INICIO DE AVENTURA: Cuando la ubicacion sea "Inicio de la aventura" y un jugador se presente por primera vez, dale la bienvenida a su personaje y narra la escena de apertura de la aventura usando la seccion AVENTURA como referencia. Describe el contexto narrativo: donde estan, por que estan ahi, y que esta pasando. Esta cuenta como "nueva ubicacion", asi que puedes usar una descripcion mas larga.

## TIRADAS DE DADOS
- Para tiradas SECRETAS (percepcion pasiva, sigilo, trampas, reacciones de NPCs), usa [TIRADA_OCULTA: descripcion | XdY+Z = resultado].
- Para tiradas de JUGADORES, pidelo claramente en la narracion: "Tira un d20 y sumale tu modificador de Fuerza".
- Los jugadores anuncian sus resultados verbalmente.

## COMBATE
Cuando empiece un combate, usa estas etiquetas:
- [COMBATE_INICIO] al comenzar
- [COMBATE_FIN] al terminar
- [INICIATIVA: nombre=valor, nombre=valor, ...] para las iniciativas
- [DANO: nombre -X HP] cuando alguien reciba dano
- [CURACION: nombre +X HP] cuando alguien se cure
- [UBICACION: nombre del lugar] cuando cambien de ubicacion
- [MISION: descripcion de la mision] cuando se revele o actualice una mision

Gestiona el combate estrictamente. Usa [DM_PIENSA] para planificar las acciones de los enemigos y [TIRADA_OCULTA] para sus tiradas de ataque/dano ANTES de narrar el resultado.

## ESTADO ACTUAL`;

export class AIManager {
  constructor(gameState, combatTracker) {
    this.gameState = gameState;
    this.combatTracker = combatTracker;
    this.adventureText = '';
    this.dmgText = '';
    this.phbText = '';
    this.onResponse = null;        // callback(text, tags[])
    this.onStatusUpdate = null;    // callback({ location, quest })
  }

  async loadAdventure() {
    const results = { adventure: false, dmg: false, phb: false };

    try {
      const response = await fetch('/api/adventure');
      if (response.ok) {
        const data = await response.json();
        this.adventureText = data.text;
        results.adventure = true;
      }
    } catch (e) {
      console.warn('No se pudo cargar la aventura:', e);
    }

    try {
      const response = await fetch('/api/dmg');
      if (response.ok) {
        const data = await response.json();
        this.dmgText = data.text;
        results.dmg = true;
      }
    } catch (e) {
      console.warn('No se pudo cargar la DMG:', e);
    }

    try {
      const response = await fetch('/api/phb');
      if (response.ok) {
        const data = await response.json();
        this.phbText = data.text;
        results.phb = true;
      }
    } catch (e) {
      console.warn('No se pudo cargar el PHB:', e);
    }

    return results;
  }

  buildSystemPrompt() {
    const parts = [SYSTEM_PROMPT];

    // Estado de jugadores
    parts.push(`\nJugadores: ${this.gameState.getPlayersSummary()}`);
    parts.push(`Ubicacion: ${this.gameState.location}`);
    parts.push(`Mision activa: ${this.gameState.quest}`);

    // Estado de combate
    if (this.combatTracker.active) {
      parts.push(`\n## COMBATE EN CURSO\n${this.combatTracker.getCombatSummary()}`);
    }

    // Reglas D&D (DMG + PHB)
    if (this.dmgText || this.phbText) {
      const rules = this.getRelevantRules();
      if (rules) {
        parts.push(`\n## REGLAS D&D (PHB + DMG referencia)\n${rules}`);
      }
    }

    // Contexto de la aventura
    if (this.adventureText) {
      const context = this.getRelevantContext();
      parts.push(`\n## AVENTURA (referencia)\n${context}`);
    }

    return parts.join('\n');
  }

  getRelevantContext() {
    if (!this.adventureText) return '';

    // Buscar la seccion relevante basada en la ubicacion actual
    const location = this.gameState.location.toLowerCase();
    const sections = this.adventureText.split(/--- Pagina \d+ ---/);

    // Buscar secciones que mencionen la ubicacion actual
    const relevant = sections.filter(s =>
      s.toLowerCase().includes(location) ||
      s.toLowerCase().includes('phandalin') ||
      s.toLowerCase().includes('cragmaw')
    );

    if (relevant.length > 0) {
      return relevant.slice(0, 3).join('\n').substring(0, 8000);
    }

    // Fallback: primeras paginas
    return this.adventureText.substring(0, 6000);
  }

  getRelevantRules() {
    if (!this.dmgText && !this.phbText) return this.getBaselineRules();

    const lastMessage = this.gameState.conversationHistory
      .filter(m => m.role === 'user')
      .pop()?.content || '';

    const searchTerms = this.extractSearchTerms(lastMessage);

    // Añadir terminos de combate si hay combate activo
    if (this.combatTracker.active) {
      searchTerms.push('combat', 'combate', 'attack', 'ataque', 'damage',
        'initiative', 'iniciativa', 'saving throw', 'salvacion', 'action', 'accion');
    }

    if (searchTerms.length === 0) return this.getBaselineRules();

    // Puntuar secciones de DMG y PHB
    const scoredSections = [];
    const sources = [
      { text: this.dmgText, label: 'DMG' },
      { text: this.phbText, label: 'PHB' },
    ];

    for (const source of sources) {
      if (!source.text) continue;
      const sections = source.text.split(/--- Pagina \d+ ---/);

      for (const section of sections) {
        if (section.trim().length < 100) continue;
        const lower = section.toLowerCase();
        let score = 0;

        for (const term of searchTerms) {
          if (lower.includes(term)) {
            score += 1;
            // Bonus si aparece al principio de la seccion (probable titulo)
            if (lower.substring(0, 200).includes(term)) {
              score += 2;
            }
          }
        }

        if (score > 0) {
          scoredSections.push({ section, score, source: source.label });
        }
      }
    }

    scoredSections.sort((a, b) => b.score - a.score);

    // Construir resultado con presupuesto de 8000 chars
    const MAX_CHARS = 8000;
    let result = '';
    let usedChars = 0;

    for (const entry of scoredSections) {
      const trimmed = entry.section.trim();
      if (usedChars + trimmed.length > MAX_CHARS) {
        const remaining = MAX_CHARS - usedChars;
        if (remaining > 500) {
          result += `[${entry.source}]\n${trimmed.substring(0, remaining)}\n\n`;
        }
        break;
      }
      result += `[${entry.source}]\n${trimmed}\n\n`;
      usedChars += trimmed.length;
    }

    return result || this.getBaselineRules();
  }

  extractSearchTerms(text) {
    const stopWords = new Set([
      'el', 'la', 'los', 'las', 'de', 'del', 'que', 'un', 'una', 'unos', 'unas',
      'y', 'o', 'en', 'es', 'no', 'por', 'con', 'para', 'mi', 'tu', 'su', 'al',
      'se', 'lo', 'le', 'me', 'nos', 'les', 'eso', 'esta', 'este', 'esto',
      'quiero', 'voy', 'hago', 'puedo', 'como', 'donde', 'hay', 'ser', 'si',
      'pero', 'mas', 'muy', 'ya', 'soy', 'son', 'fue', 'era', 'tiene', 'hacer',
      'the', 'a', 'is', 'it', 'to', 'and', 'of', 'in', 'my', 'i', 'you', 'we',
      'he', 'do', 'this', 'that', 'can', 'want', 'hola', 'vale', 'bien', 'pues',
    ]);

    return text.toLowerCase()
      .split(/[\s,.;:!?¿¡()[\]{}]+/)
      .filter(w => w.length >= 3 && !stopWords.has(w));
  }

  getBaselineRules() {
    return `Reglas basicas de referencia:
- Pruebas de habilidad: d20 + modificador vs CD.
- Tiradas de salvacion: d20 + modificador de salvacion vs CD.
- Ataques: d20 + modificador de ataque vs CA del objetivo.
- Ventaja/Desventaja: tirar 2d20, tomar el mayor/menor.
- Acciones en combate: Atacar, Lanzar conjuro, Esquivar, Desengancharse, Ayudar, Esconderse, Preparar, Carrera, Buscar, Usar objeto.
- Descanso corto: 1+ horas, gastar Dados de Golpe para recuperar HP.
- Descanso largo: 8+ horas, recuperar todos los HP y la mitad de los Dados de Golpe.
- Muerte: 0 HP = inconsciente. Tiradas de salvacion de muerte: d20, 10+ exito, <10 fallo, 3 fallos = muerte, 20 natural = 1 HP.`;
  }

  async sendMessage(playerText) {
    const systemPrompt = this.buildSystemPrompt();
    const history = this.gameState.getRecentMessages();

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: playerText },
    ];

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.8,
          max_tokens: 1200,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || 'El DM guarda silencio...';

      // Guardar en historial
      this.gameState.addMessage('user', playerText);
      this.gameState.addMessage('assistant', text);

      // Parsear etiquetas especiales
      const tags = this.parseTags(text);
      this.processTags(tags);

      // Limpiar texto para TTS (quitar etiquetas)
      const cleanText = this.cleanForSpeech(text);

      if (this.onResponse) {
        this.onResponse(text, cleanText, tags);
      }

      return { text, cleanText, tags };
    } catch (error) {
      console.error('Error IA:', error);
      return { text: 'Error comunicando con el DM...', cleanText: '', tags: [] };
    }
  }

  parseTags(text) {
    const tags = [];
    const patterns = [
      { type: 'combat_start', regex: /\[COMBATE_INICIO\]/g },
      { type: 'combat_end', regex: /\[COMBATE_FIN\]/g },
      { type: 'initiative', regex: /\[INICIATIVA:\s*(.+?)\]/g },
      { type: 'damage', regex: /\[DANO:\s*(.+?)\s+-(\d+)\s*HP\]/g },
      { type: 'heal', regex: /\[CURACION:\s*(.+?)\s+\+(\d+)\s*HP\]/g },
      { type: 'hidden_roll', regex: /\[TIRADA_OCULTA:\s*(.+?)\]/g },
      { type: 'dm_thinks', regex: /\[DM_PIENSA:\s*(.+?)\]/g },
      { type: 'dm_event', regex: /\[DM_EVENTO:\s*(.+?)\]/g },
      { type: 'location', regex: /\[UBICACION:\s*(.+?)\]/g },
      { type: 'quest', regex: /\[MISION:\s*(.+?)\]/g },
    ];

    for (const { type, regex } of patterns) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        tags.push({ type, raw: match[0], groups: match.slice(1) });
      }
    }

    return tags;
  }

  processTags(tags) {
    for (const tag of tags) {
      switch (tag.type) {
        case 'combat_start':
          this.combatTracker.startCombat();
          break;

        case 'combat_end':
          this.combatTracker.endCombat();
          break;

        case 'initiative': {
          const entries = tag.groups[0].split(',').map(e => e.trim());
          for (const entry of entries) {
            const m = entry.match(/(.+?)=(\d+)/);
            if (m) {
              const name = m[1].trim();
              const init = parseInt(m[2]);
              const player = this.gameState.players.find(
                p => p.name.toLowerCase() === name.toLowerCase()
              );
              this.combatTracker.addCombatant({
                name,
                initiative: init,
                hp: player?.hp || 10,
                maxHp: player?.maxHp || 10,
                ac: player?.ac || 10,
                isPlayer: !!player,
              });
            }
          }
          break;
        }

        case 'damage': {
          const targetName = tag.groups[0];
          const damage = parseInt(tag.groups[1]);
          const target = this.combatTracker.combatants.find(
            c => c.name.toLowerCase() === targetName.toLowerCase()
          );
          if (target) this.combatTracker.applyDamage(target.id, damage);
          break;
        }

        case 'heal': {
          const targetName = tag.groups[0];
          const amount = parseInt(tag.groups[1]);
          const target = this.combatTracker.combatants.find(
            c => c.name.toLowerCase() === targetName.toLowerCase()
          );
          if (target) this.combatTracker.healCombatant(target.id, amount);
          break;
        }

        case 'location':
          this.gameState.updateLocation(tag.groups[0]);
          if (this.onStatusUpdate) this.onStatusUpdate({ location: tag.groups[0] });
          break;

        case 'quest':
          this.gameState.updateQuest(tag.groups[0]);
          if (this.onStatusUpdate) this.onStatusUpdate({ quest: tag.groups[0] });
          break;
      }
    }
  }

  cleanForSpeech(text) {
    return text
      .replace(/\[COMBATE_INICIO\]/g, '')
      .replace(/\[COMBATE_FIN\]/g, '')
      .replace(/\[INICIATIVA:[^\]]+\]/g, '')
      .replace(/\[DANO:[^\]]+\]/g, '')
      .replace(/\[CURACION:[^\]]+\]/g, '')
      .replace(/\[TIRADA_OCULTA:[^\]]+\]/g, '')
      .replace(/\[DM_PIENSA:[^\]]+\]/g, '')
      .replace(/\[DM_EVENTO:[^\]]+\]/g, '')
      .replace(/\[UBICACION:[^\]]+\]/g, '')
      .replace(/\[MISION:[^\]]+\]/g, '')
      .replace(/\*[^*]+\*/g, '') // Quitar itálicas markdown
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Mensaje inicial del DM al empezar la partida */
  getWelcomePrompt() {
    if (this.gameState.players.length === 0) {
      return 'La partida esta a punto de comenzar. Necesito que los jugadores se presenten. Dime: como se llama tu personaje, que clase es, y un breve trasfondo. Puedes empezar cuando quieras.';
    }
    return `Continuamos la aventura. ${this.gameState.getPlayersSummary()}. Estais en: ${this.gameState.location}. Que haceis?`;
  }
}
