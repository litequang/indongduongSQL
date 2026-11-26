import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Persistent server-side JSON store file path
const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'workshop_data.json');

// Gemini AI setup
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface ServerStore {
  users: any[];
  orders: any[];
  config: any;
  updatedAt: string;
}

function loadStore(): ServerStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      // A newly-created/zero-byte local store is equivalent to no persisted
      // state. Avoid surfacing a misleading JSON parse error during startup.
      if (raw.trim()) return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Error reading store file:', err);
  }
  return {
    users: [],
    orders: [],
    config: null,
    updatedAt: new Date().toISOString()
  };
}

function saveStore(store: ServerStore) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Error writing store file:', err);
  }
}

// In-memory cache
let inMemoryStore = loadStore();

// --- API ROUTES ---

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// GET /api/users
app.get('/api/users', (req, res) => {
  res.json({ success: true, users: inMemoryStore.users || [] });
});

// POST /api/users (bulk or sync)
app.post('/api/users', (req, res) => {
  const { users } = req.body;
  if (Array.isArray(users)) {
    // Merge rather than overwrite
    const map = new Map<string, any>();
    (inMemoryStore.users || []).forEach(u => map.set(u.id, u));
    users.forEach(u => map.set(u.id, { ...map.get(u.id), ...u, updatedAt: new Date().toISOString() }));
    inMemoryStore.users = Array.from(map.values());
    inMemoryStore.updatedAt = new Date().toISOString();
    saveStore(inMemoryStore);
  }
  res.json({ success: true, count: inMemoryStore.users.length });
});

// PUT /api/users/:id (update single user)
app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!inMemoryStore.users) inMemoryStore.users = [];
  const idx = inMemoryStore.users.findIndex((u: any) => u.id === id);

  if (idx >= 0) {
    inMemoryStore.users[idx] = {
      ...inMemoryStore.users[idx],
      ...updates,
      id,
      updatedAt: new Date().toISOString()
    };
  } else {
    inMemoryStore.users.push({
      ...updates,
      id,
      updatedAt: new Date().toISOString()
    });
  }

  inMemoryStore.updatedAt = new Date().toISOString();
  saveStore(inMemoryStore);

  const updatedUser = inMemoryStore.users.find((u: any) => u.id === id);
  res.json({ success: true, user: updatedUser });
});

// DELETE /api/users/:id
app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;
  if (inMemoryStore.users) {
    inMemoryStore.users = inMemoryStore.users.filter((u: any) => u.id !== id);
    inMemoryStore.updatedAt = new Date().toISOString();
    saveStore(inMemoryStore);
  }
  res.json({ success: true });
});

// GET /api/orders
app.get('/api/orders', (req, res) => {
  res.json({ success: true, orders: inMemoryStore.orders || [] });
});

// POST /api/orders (bulk or sync)
app.post('/api/orders', (req, res) => {
  const { orders } = req.body;
  if (Array.isArray(orders)) {
    // Merge rather than overwrite
    const map = new Map<string, any>();
    (inMemoryStore.orders || []).forEach(o => map.set(o.id, o));
    orders.forEach(o => map.set(o.id, { ...map.get(o.id), ...o, updatedAt: new Date().toISOString() }));
    inMemoryStore.orders = Array.from(map.values());
    inMemoryStore.updatedAt = new Date().toISOString();
    saveStore(inMemoryStore);
  }
  res.json({ success: true, count: inMemoryStore.orders.length });
});

// PUT /api/orders/:id
app.put('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const orderData = req.body;

  if (!inMemoryStore.orders) inMemoryStore.orders = [];
  const idx = inMemoryStore.orders.findIndex((o: any) => o.id === id);

  if (idx >= 0) {
    inMemoryStore.orders[idx] = {
      ...inMemoryStore.orders[idx],
      ...orderData,
      id,
      updatedAt: new Date().toISOString()
    };
  } else {
    inMemoryStore.orders.push({
      ...orderData,
      id,
      updatedAt: new Date().toISOString()
    });
  }

  inMemoryStore.updatedAt = new Date().toISOString();
  saveStore(inMemoryStore);
  res.json({ success: true });
});

// DELETE /api/orders/:id
app.delete('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  if (inMemoryStore.orders) {
    inMemoryStore.orders = inMemoryStore.orders.filter((o: any) => o.id !== id);
    inMemoryStore.updatedAt = new Date().toISOString();
    saveStore(inMemoryStore);
  }
  res.json({ success: true });
});

// DELETE /api/orders (batch or all)
app.delete('/api/orders', (req, res) => {
  const { orderIds } = req.body || {};
  if (Array.isArray(orderIds) && orderIds.length > 0) {
    inMemoryStore.orders = (inMemoryStore.orders || []).filter((o: any) => !orderIds.includes(o.id));
  } else {
    inMemoryStore.orders = [];
  }
  inMemoryStore.updatedAt = new Date().toISOString();
  saveStore(inMemoryStore);
  res.json({ success: true });
});

// GET /api/config
app.get('/api/config', (req, res) => {
  res.json({ success: true, config: inMemoryStore.config });
});

// POST /api/config
app.post('/api/config', (req, res) => {
  const { config } = req.body;
  if (config) {
    inMemoryStore.config = config;
    inMemoryStore.updatedAt = new Date().toISOString();
    saveStore(inMemoryStore);
  }
  res.json({ success: true });
});

// POST /api/gemini/map-fields
app.post('/api/gemini/map-fields', async (req, res) => {
  try {
    const { headers, sampleRows } = req.body;
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured.' });
    }

    const prompt = `You are a data mapping assistant. Map the provided CSV/Excel headers to the standard Customer schema.
    
    Standard Customer Schema Fields:
    - name (Tên khách hàng)
    - phone (Số điện thoại)
    - address (Địa chỉ giao hàng)
    - province (Tỉnh/Thành phố)
    - district (Quận/Huyện)
    - ward (Phường/Xã)
    - zalo (Zalo)
    - facebook (Facebook)
    - note (Ghi chú)
    - externalId (ID hệ thống ngoài / ID Sapo)

    Provided Headers: ${JSON.stringify(headers)}
    Sample Data (First 3 rows): ${JSON.stringify(sampleRows)}

    Return a valid JSON object ONLY, where keys are the Provided Headers and values are the corresponding Standard Schema Field names (or null if no match). Do not include any markdown formatting.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const resultText = response.text || "{}";
    res.json({ success: true, mapping: JSON.parse(resultText) });
  } catch (error: any) {
    console.error('Gemini error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Flexo Server running on port ${PORT}`);
  });
}

startServer();
