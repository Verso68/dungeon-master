# D&D Dungeon Master con Voz

## Objetivo

Aplicacion web que actua como Dungeon Master de D&D 5e con interaccion por voz en tiempo real. Los jugadores hablan al DM diciendo "Master" y el DM responde por voz en espanol. La pantalla del ordenador esta girada (los jugadores no la ven) y actua como "pantalla del DM": muestra el chat completo con narracion, procesos internos, tiradas secretas y decisiones de la IA. Los jugadores solo escuchan la voz.

## Aventura y Materiales de Referencia

- **Aventura activa**: "La Mina Perdida de Phandelver". Se extrae con `python3 scripts/extract-pdf.py "archivo.pdf" adventure` -> `data/adventure.txt`.
- **Guia del Dungeon Master (DMG)**: Se extrae con `python3 scripts/extract-pdf.py "archivo.pdf" dmg` -> `data/dmg.txt`. Referencia de reglas del DM.
- **Player's Handbook (PHB)**: Se extrae con `python3 scripts/extract-pdf.py "archivo.pdf" phb` -> `data/phb.txt`. Referencia de reglas de jugador (clases, hechizos, habilidades).
- Los PDFs originales NO se suben al repo (`*.pdf` en `.gitignore`). Los textos extraidos tampoco (`data/*.txt` en `.gitignore`).
- Para anadir mas libros de referencia: extraer con el script, anadir endpoint en `server.js`, cargar en `ai-manager.js`.

## Arquitectura

```
[Microfono] -> [VAD] -> [Whisper API] -> [Filtro "Master"] -> [GPT-4o-mini] -> [TTS API] -> [Altavoz]
                                              |                      |
                                   [Chatter atenuado]    [Aventura + DMG + PHB + Estado de juego]
```

- **Frontend**: HTML + CSS + Vanilla JS (sin frameworks, sin bundler)
- **Backend**: Node.js + Express (solo proxy seguro para API keys de OpenAI)
- **IA**: OpenAI GPT-4o-mini
- **Voz entrada**: OpenAI Whisper API (idioma: espanol)
- **Voz salida**: OpenAI TTS API (voz "onyx", speed 0.95)
- **VAD**: @ricky0123/vad-web v0.0.29 via CDN (con ONNX Runtime v1.22.0)

## Estructura del Proyecto

```
server/
  server.js            # Express: proxy para /api/whisper, /api/chat, /api/tts, /api/adventure, /api/dmg, /api/phb
  package.json         # type: module, deps: express, multer, dotenv
  .env                 # OPENAI_API_KEY (nunca commitear)
client/
  index.html           # UI principal. Carga VAD via script tags CDN (onnxruntime-web + vad-web)
  css/styles.css       # Tema oscuro medieval con CSS grid responsive
  js/
    app.js             # Orquestador: filtro "Master", identificacion de jugador, audio -> IA -> combate -> UI
    audio-manager.js   # Pipeline de voz: VAD (global `vad`) + Whisper + TTS (division por frases) + Float32->WAV + pausa anti-eco
    ai-manager.js      # GPT-4o-mini: system prompt, contexto dinamico (aventura + DMG + PHB), parseo de etiquetas
    combat-tracker.js  # Iniciativa, HP, turnos, condiciones, tiradas ocultas. Metodo getCombatSummary()
    dice-roller.js     # Funciones puras: roll(), d20(), parseAndRoll("2d6+3"). Sin estado
    game-state.js      # Jugadores, ubicacion, mision, historial (max 50 msgs). Persiste en localStorage
data/
  adventure.txt        # Texto extraido del PDF de la aventura (se busca por ubicacion actual)
  dmg.txt              # Texto extraido del PDF de la Guia del DM (busqueda dinamica multi-fuente)
  phb.txt              # Texto extraido del PDF del Manual del Jugador (busqueda dinamica multi-fuente)
scripts/
  extract-pdf.py       # Extrae texto de PDFs con PyPDF2. Uso: python3 extract-pdf.py <pdf> <nombre>
```

## Convenciones de Codigo

- JavaScript ES modules (`import`/`export`) en el cliente
- Node.js ES modules (`"type": "module"` en package.json)
- Sin frameworks ni bundlers: vanilla JS, CSS puro, HTML semantico
- Clases para modulos con estado (AudioManager, AIManager, GameState, CombatTracker)
- Funciones puras para utilidades (dice-roller.js)
- El VAD se accede via objeto global `vad` (cargado por script tags CDN), NO como ES module import

## Filtro "Master" e Identificacion de Jugador

- Los jugadores se dirigen al DM diciendo "Master, ...". Solo los mensajes que empiezan con "Master" se envian a la IA.
- Las transcripciones sin "Master" se muestran atenuadas en el chat como "chatter" (no van a la IA).
- El jugador se identifica con "Master, soy [nombre], ...". A partir de ese momento, sus mensajes se etiquetan con su nombre (`[Nombre]: texto`) y la UI muestra su nombre como autor.
- Si no dice "soy [nombre]", se asume que es el ultimo jugador que se identifico (`activePlayer`).
- **Comandos de voz**: "Master, espera" / "Master, apaga el micro" / "Master, un momento" → apaga el microfono. Se reactiva con el boton fisico "Activar Micro".
- **Input de texto** (teclado): va directo a la IA sin necesidad de "Master" (util para testing/operador).

## Sistema de Etiquetas IA

El system prompt instruye a GPT-4o-mini a incluir etiquetas estructuradas en sus respuestas. `ai-manager.js` las parsea en `parseTags()` y las procesa en `processTags()` para actualizar el estado del juego:

### Etiquetas de proceso interno (SOLO pantalla, NO se narran por voz)

| Etiqueta | Proposito | UI |
|---|---|---|
| `[DM_PIENSA: contenido]` | Razonamiento interno del DM (reglas, CDs, estrategia) | Bloque morado 🧠 |
| `[TIRADA_OCULTA: desc \| XdY+Z = resultado]` | Tirada secreta del DM | Bloque dorado 🎲 |
| `[DM_EVENTO: contenido]` | Eventos secretos del mundo (emboscadas, trampas, NPCs) | Bloque naranja 👁️ |

### Etiquetas de estado del juego

| Etiqueta | Proposito |
|---|---|
| `[COMBATE_INICIO]` | Inicia el tracker de combate |
| `[COMBATE_FIN]` | Finaliza el combate |
| `[INICIATIVA: nombre=valor, ...]` | Registra iniciativas |
| `[DANO: nombre -X HP]` | Aplica dano |
| `[CURACION: nombre +X HP]` | Aplica curacion |
| `[UBICACION: nombre]` | Actualiza ubicacion actual |
| `[MISION: descripcion]` | Actualiza mision activa |

Todas las etiquetas se eliminan del texto antes de enviarlo a TTS (`cleanForSpeech()`). En la UI se renderizan con iconos, colores y estilos diferenciados (`formatMessage()`). Las etiquetas de proceso interno se muestran como bloques `.dm-internal` con borde lateral coloreado.

## Contexto Dinamico de la IA

`ai-manager.js` construye el system prompt en cada peticion con:

1. **System prompt base**: Rol del DM, formato de respuesta dual (proceso interno + narracion), reglas de interaccion, convencion "Master" e identificacion de jugador, formato de etiquetas
2. **Estado actual**: Jugadores, ubicacion, mision activa
3. **Combate** (si activo): Resumen de combatientes via `getCombatSummary()`
4. **Reglas D&D** (contextual): `getRelevantRules()` busca en DMG Y PHB a la vez con:
   - Extraccion dinamica de keywords del mensaje del jugador (filtrado de stop words, sin lista fija)
   - Scoring por seccion: mas puntos si el termino aparece al inicio (probable titulo)
   - Si hay combate activo, se anaden terminos de combate automaticamente
   - Fallback: `getBaselineRules()` devuelve resumen de mecanicas basicas si no hay coincidencias
   - Presupuesto: max 8000 chars combinados entre ambas fuentes
5. **Aventura** (contextual): `getRelevantContext()` busca secciones por ubicacion actual, max 8000 chars

## Server API Endpoints

| Endpoint | Metodo | Descripcion |
|---|---|---|
| `/api/whisper` | POST | Proxy a OpenAI Whisper. Recibe audio multipart, devuelve `{ text }` |
| `/api/chat` | POST | Proxy a OpenAI Chat Completions. Body JSON passthrough |
| `/api/tts` | POST | Proxy a OpenAI TTS (streaming via pipe). Body JSON, devuelve audio/mpeg |
| `/api/adventure` | GET | Sirve `data/adventure.txt` como `{ text }` |
| `/api/dmg` | GET | Sirve `data/dmg.txt` como `{ text }` |
| `/api/phb` | GET | Sirve `data/phb.txt` como `{ text }` |

## Comandos

```bash
# Extraer texto de los PDFs (desde la raiz del proyecto)
python3 scripts/extract-pdf.py "La Mina Perdida de Phandelver.pdf" adventure
python3 scripts/extract-pdf.py "Dungeon Masters Guide.pdf" dmg
python3 scripts/extract-pdf.py "Players Handbook.pdf" phb

# Instalar dependencias del servidor
cd server && npm install

# Arrancar el servidor
cd server && npm start        # produccion
cd server && npm run dev      # con auto-reload (node --watch)

# Abrir en navegador
open http://localhost:3000    # requiere Chrome o Edge para VAD
```

## Notas Importantes

- El `.env` con la API key de OpenAI NUNCA debe commitearse ni compartirse
- Los PDFs estan en `.gitignore` por derechos de autor
- El idioma de juego es espanol. El system prompt, la UI y el Whisper estan configurados para espanol
- El VAD se carga via CDN (onnxruntime-web + @ricky0123/vad-web) como script tags globales, no como ES module imports. Requiere `baseAssetPath` y `onnxWASMBasePath` explicitos
- El micro se pausa automaticamente mientras el DM habla para evitar eco (`isSpeaking` flag)
- El micro se puede apagar por voz ("Master, espera") o con el boton fisico. Solo se reactiva con el boton "Activar Micro"
- La voz del DM usa division por frases para reducir latencia: primera frase + resto se piden en paralelo a TTS, se reproducen secuencialmente
- La pantalla actua como "pantalla del DM": muestra todo (narracion + proceso interno + chatter) pero solo se narra por voz el texto fuera de etiquetas
- El boton "Reiniciar" (footer) borra localStorage, resetea estado (incluido `activePlayer`) y muestra bienvenida. Usa `gameState.reset()` y pide confirmacion
- El estado del juego se auto-guarda en localStorage cada 30 segundos
- El historial de conversacion se limita a 50 mensajes; se envian los ultimos 15 a la IA
- Los archivos ocultos (`.env`, `.gitignore`) no aparecen en Finder de macOS por defecto
