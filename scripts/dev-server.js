import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const apiDir = path.join(rootDir, 'api');

// 1. Load .env.local if present
export function loadEnvLocal() {
  const envPath = path.join(rootDir, '.env.local');
  if (!fs.existsSync(envPath)) return;

  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile(envPath);
      return;
    }
  } catch (err) {
    // Fall back to custom parser
  }

  try {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch (err) {
    console.error('Failed to parse .env.local:', err.message);
  }
}

loadEnvLocal();

export const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

// Polyfill Vercel-like response helpers
export function enhanceResponse(res) {
  if (!res.status) {
    res.status = function (code) {
      res.statusCode = code;
      return res;
    };
  }
  if (!res.json) {
    res.json = function (data) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(data));
      return res;
    };
  }
  if (!res.send) {
    res.send = function (data) {
      if (typeof data === 'object' && !Buffer.isBuffer(data)) {
        return res.json(data);
      }
      res.end(data);
      return res;
    };
  }
}

// Read body buffer and parse JSON if application/json
export function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined) {
      return resolve(req.body);
    }
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const contentType = req.headers?.['content-type'] || '';
      if (raw.length > 0 && contentType.includes('application/json')) {
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(new Error('Invalid JSON'));
        }
      } else {
        resolve(raw.length > 0 ? raw : {});
      }
    });
    req.on('error', reject);
  });
}

export function createRequestListener() {
  return async function requestListener(req, res) {
    enhanceResponse(res);

    const host = req.headers?.host || 'localhost:3000';
    const reqUrl = new URL(req.url, `http://${host}`);
    const pathname = decodeURIComponent(reqUrl.pathname);

    req.query = Object.fromEntries(reqUrl.searchParams.entries());

    // Handle /api/* routes
    if (pathname.startsWith('/api/')) {
      const routeName = pathname.slice('/api/'.length).replace(/\/$/, '');
      const handlerPath = path.join(apiDir, `${routeName}.js`);

      if (!fs.existsSync(handlerPath)) {
        return res.status(404).json({ error: `Route not found: ${pathname}` });
      }

      try {
        req.body = await parseBody(req);
      } catch (err) {
        return res.status(400).json({ error: 'Invalid JSON payload' });
      }

      try {
        const moduleUrl = `${pathToFileURL(handlerPath).href}?t=${Date.now()}`;
        const mod = await import(moduleUrl);
        const handler = mod.default || mod;

        if (typeof handler !== 'function') {
          return res.status(500).json({ error: `Handler in ${routeName}.js is not a function` });
        }

        await handler(req, res);
      } catch (err) {
        console.error(`Error executing ${pathname}:`, err);
        if (!res.writableEnded) {
          res.status(500).json({ error: err.message || 'Internal Server Error' });
        }
      }
      return;
    }

    // Handle static files from /public
    let relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    let filePath = path.join(publicDir, relativePath);

    // Prevent directory traversal
    if (!filePath.startsWith(publicDir)) {
      return res.status(403).send('Forbidden');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.status(404).send('Not Found');
    }
  };
}

export function startServer(port = process.env.PORT || 3000) {
  const listener = createRequestListener();
  const server = http.createServer(listener);
  server.listen(port, () => {
    console.log(`> Dev server running at http://localhost:${port}`);
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}
