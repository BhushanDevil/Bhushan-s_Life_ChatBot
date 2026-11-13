export default async function handler(req, res) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(200).json({ ok: true });
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true }));
}
