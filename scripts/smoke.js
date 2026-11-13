import { createRequestListener } from './dev-server.js';
import { EventEmitter } from 'node:events';

class MockRequest extends EventEmitter {
  constructor({ method = 'GET', url = '/', headers = {}, body = null } = {}) {
    super();
    this.method = method;
    this.url = url;
    this.headers = headers;
    this.body = body;
  }
}

class MockResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
    this.writableEnded = false;
  }

  setHeader(name, val) {
    this.headers[name.toLowerCase()] = val;
  }

  getHeader(name) {
    return this.headers[name.toLowerCase()];
  }

  write(chunk) {
    if (chunk) this.chunks.push(Buffer.from(chunk));
    return true;
  }

  end(data) {
    if (data) this.chunks.push(Buffer.from(data));
    this.writableEnded = true;
    this.emit('finish');
    return this;
  }

  get bodyText() {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

async function simulate(listener, { method = 'GET', url = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = new MockRequest({ method, url, headers, body });
    const res = new MockResponse();

    res.on('finish', () => {
      resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: res.bodyText
      });
    });

    try {
      listener(req, res).catch(reject);
      if (body) {
        req.emit('data', typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.emit('end');
    } catch (err) {
      reject(err);
    }
  });
}

async function runSmokeTests() {
  console.log('Running smoke tests...\n');
  const listener = createRequestListener();

  // Test 1: GET / (serves index.html)
  const homeRes = await simulate(listener, { method: 'GET', url: '/' });
  console.log(`[TEST 1] GET / -> Status ${homeRes.statusCode}`);
  if (homeRes.statusCode !== 200 || !homeRes.body.includes("Ask Bhushan")) {
    throw new Error(`Home page test failed: Status ${homeRes.statusCode}, body: ${homeRes.body.slice(0, 100)}`);
  }
  console.log('  ✓ Static index.html served successfully.');

  // Test 2: GET /api/health -> returns { ok: true }
  const healthRes = await simulate(listener, { method: 'GET', url: '/api/health' });
  console.log(`[TEST 2] GET /api/health -> Status ${healthRes.statusCode}`);
  const parsedHealth = JSON.parse(healthRes.body);
  if (healthRes.statusCode !== 200 || parsedHealth.ok !== true) {
    throw new Error(`Health check test failed: Status ${healthRes.statusCode}, body: ${healthRes.body}`);
  }
  console.log('  ✓ /api/health returned { ok: true }.');

  // Test 3: GET /api/unknown -> returns 404
  const notFoundRes = await simulate(listener, { method: 'GET', url: '/api/unknown' });
  console.log(`[TEST 3] GET /api/unknown -> Status ${notFoundRes.statusCode}`);
  if (notFoundRes.statusCode !== 404) {
    throw new Error(`Unknown route should return 404, got ${notFoundRes.statusCode}`);
  }
  console.log('  ✓ 404 handled gracefully.');

  console.log('\nAll smoke tests passed cleanly!');
}

runSmokeTests().catch(err => {
  console.error('\nSmoke test failure:', err);
  process.exit(1);
});
