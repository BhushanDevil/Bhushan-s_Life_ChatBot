import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contentDir = path.resolve(__dirname, '../content');

let cachedBook = null;

/**
 * Loads all markdown files in /content in alphabetical order,
 * caches the result, and returns the combined string.
 * Fails loudly if the content folder is missing or empty.
 */
export function getProfileBook() {
  if (cachedBook) {
    return cachedBook;
  }

  if (!fs.existsSync(contentDir)) {
    throw new Error(`Profile book content directory missing: ${contentDir}`);
  }

  const files = fs.readdirSync(contentDir)
    .filter(file => file.endsWith('.md'))
    .sort();

  if (files.length === 0) {
    throw new Error(`Profile book directory exists but contains no markdown files: ${contentDir}`);
  }

  const sections = files.map(file => {
    const fullPath = path.join(contentDir, file);
    const content = fs.readFileSync(fullPath, 'utf8').trim();
    return `<!-- FILE: ${file} -->\n${content}`;
  });

  cachedBook = sections.join('\n\n---\n\n');
  return cachedBook;
}

// Initial load at startup to fail loudly early if folder is missing
try {
  getProfileBook();
} catch (err) {
  // In dynamic/test environments, allow delayed evaluation if needed, but log
  console.error('[lib/book.js] Warning during startup load:', err.message);
}
