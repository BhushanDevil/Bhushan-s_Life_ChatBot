/**
 * scripts/eval.js
 * Evaluation runner that executes benchmark interview and edge-case questions,
 * verifying word limits, keyword inclusions/exclusions, and numerical truthfulness.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvLocal } from './dev-server.js';
import { getProfileBook } from '../lib/book.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const questionsPath = path.join(rootDir, 'eval', 'questions.json');

loadEnvLocal();

// Parse CLI flags
const args = process.argv.slice(2);
let baseUrl = 'http://localhost:3000';
for (const arg of args) {
  if (arg.startsWith('--url=')) {
    baseUrl = arg.slice('--url='.length).replace(/\/$/, '');
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function countWords(str) {
  if (!str) return 0;
  return str.trim().split(/\s+/).filter(Boolean).length;
}

function extractNumbers(str) {
  if (!str) return [];
  // Match standalone digits, decimals, percentages (e.g. 45%, 4.5, 25000, 2025)
  const matches = str.match(/\b\d+(\.\d+)?%?\b/g) || [];
  return matches.map(m => m.replace(/%$/, ''));
}

async function runEvaluation() {
  console.log(`\n======================================================`);
  console.log(`Starting Evaluation Test Suite against: ${baseUrl}`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(questionsPath)) {
    throw new Error(`Questions file not found at: ${questionsPath}`);
  }

  const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
  const profileBookText = getProfileBook();

  // Pre-index all numbers present in the profile book
  const validNumbersInContent = new Set(extractNumbers(profileBookText));

  let localServer = null;
  if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
    try {
      await fetch(`${baseUrl}/api/health`);
    } catch (err) {
      const { startServer } = await import('./dev-server.js');
      localServer = startServer(3000);
      await sleep(1000);
    }
  }

  let passedCount = 0;
  let failedCount = 0;
  const failures = [];

  try {
    for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`[${i + 1}/${questions.length}] Testing (${q.id}): "${q.question}"`);

    let response;
    let data;

    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-eval-suite': 'true'
        },
        body: JSON.stringify({ text: q.question, history: [] })
      });
      data = await response.json();
    } catch (err) {
      console.error(`  ❌ Network request failed: ${err.message}`);
      failedCount++;
      failures.push({ id: q.id, question: q.question, reason: `Network error: ${err.message}` });
      continue;
    }

    if (!response.ok) {
      console.error(`  ❌ HTTP error ${response.status}:`, data);
      failedCount++;
      failures.push({ id: q.id, question: q.question, reason: `HTTP ${response.status}: ${JSON.stringify(data)}` });
      continue;
    }

    const answer = data.answer || '';
    const wordCount = countWords(answer);
    const errors = [];

    // Check 1: Max word limit
    if (wordCount > q.maxWords) {
      errors.push(`Word count exceeded: ${wordCount} words (limit: ${q.maxWords})`);
    }

    // Check 2: Must include keywords
    if (q.must_include && q.must_include.length > 0) {
      for (const kw of q.must_include) {
        if (!answer.toLowerCase().includes(kw.toLowerCase())) {
          errors.push(`Missing required keyword: "${kw}"`);
        }
      }
    }

    // Check 3: Must not include forbidden terms/patterns
    if (q.must_not_include && q.must_not_include.length > 0) {
      for (const forbidden of q.must_not_include) {
        if (answer.toLowerCase().includes(forbidden.toLowerCase())) {
          errors.push(`Contains forbidden term: "${forbidden}"`);
        }
      }
    }

    // Check 4: Truthfulness number check
    if (q.check_numbers) {
      const numbersInAnswer = extractNumbers(answer);
      for (const num of numbersInAnswer) {
        // Allow single digits 1-4 used for list items, or numbers that exist in content
        if (['1', '2', '3', '4'].includes(num)) continue;
        if (!validNumbersInContent.has(num)) {
          errors.push(`Hallucinated or unverified number in answer: "${num}"`);
        }
      }
    }

    if (errors.length === 0) {
      console.log(`  ✓ PASS (${wordCount} words): "${answer.slice(0, 75)}..."`);
      passedCount++;
    } else {
      console.log(`  ❌ FAIL:`);
      errors.forEach(e => console.log(`     - ${e}`));
      console.log(`     Answer text: "${answer}"`);
      failedCount++;
      failures.push({ id: q.id, question: q.question, errors, answer });
    }

    // Pace requests by 2.5s to respect rate limits
    if (i < questions.length - 1) {
      await sleep(2500);
    }
  }

  console.log(`\n======================================================`);
  console.log(`Evaluation Summary:`);
  console.log(`Total: ${questions.length} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log(`Pass Rate: ${Math.round((passedCount / questions.length) * 100)}%`);
  console.log(`======================================================\n`);

    if (failedCount > 0) {
      console.log('Failure details:');
      failures.forEach(f => {
        console.log(`- [${f.id}] "${f.question}"`);
        (f.errors || [f.reason]).forEach(e => console.log(`    ${e}`));
      });
      process.exit(1);
    } else {
      console.log('✓ All 25 evaluation benchmarks passed with zero errors!');
    }
  } finally {
    if (localServer) {
      localServer.close();
    }
  }
}

runEvaluation().catch(err => {
  console.error('\nFatal error running evaluation:', err);
  process.exit(1);
});
