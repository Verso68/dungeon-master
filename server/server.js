import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(express.json());
app.use(express.static(join(__dirname, '..', 'client')));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY || OPENAI_API_KEY === 'sk-tu-api-key-aqui') {
  console.error('ERROR: Configura tu OPENAI_API_KEY en server/.env');
  process.exit(1);
}

// Proxy: Whisper (speech-to-text)
app.post('/api/whisper', upload.single('file'), async (req, res) => {
  try {
    const formData = new FormData();
    formData.append('file', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname);
    formData.append('model', 'whisper-1');
    formData.append('language', 'es');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Whisper error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Proxy: Chat completions (GPT-5 mini)
app.post('/api/chat', async (req, res) => {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Chat error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Proxy: TTS (text-to-speech) - streaming
app.post('/api/tts', async (req, res) => {
  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error });
    }

    res.set('Content-Type', 'audio/mpeg');
    const { Readable } = await import('stream');
    const nodeStream = Readable.fromWeb(response.body);
    nodeStream.pipe(res);
  } catch (error) {
    console.error('TTS error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Servir archivos de texto extraidos de PDFs
async function serveDataFile(filename, res) {
  try {
    const fs = await import('fs/promises');
    const filePath = join(__dirname, '..', 'data', filename);
    const text = await fs.readFile(filePath, 'utf-8');
    res.json({ text });
  } catch {
    res.status(404).json({ error: `Archivo ${filename} no encontrado. Ejecuta: python3 scripts/extract-pdf.py <pdf> <nombre>` });
  }
}

app.get('/api/adventure', (req, res) => serveDataFile('adventure.txt', res));
app.get('/api/dmg', (req, res) => serveDataFile('dmg.txt', res));
app.get('/api/phb', (req, res) => serveDataFile('phb.txt', res));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  🎲 D&D Dungeon Master Server`);
  console.log(`  ➜ http://localhost:${PORT}\n`);
});
