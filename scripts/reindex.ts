#!/usr/bin/env npx ts-node
/**
 * Reindex script for semantic-search demo
 *
 * Usage:
 *   pnpm reindex           # Uses API_KEY_WRITER from .env
 *   pnpm reindex:clean     # Delete existing docs first
 *
 * This script:
 *   1. Reads seed data from scripts/seed-data.json
 *   2. Deletes existing documents (optional, with --clean flag)
 *   3. Re-indexes all documents via POST /v1/documents
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

// Load .env.development from project root (local dev only)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
config({ path: path.join(__dirname, '..', '.env.development') })

interface DocumentMetadata {
  [key: string]: string
}

interface SeedDocument {
  id: string
  text: string
  metadata?: DocumentMetadata
}

const API_URL = process.env.API_URL
const API_KEY = process.env.API_KEY || process.env.API_KEY_WRITER

if (!API_URL) {
  console.error('Error: API_URL environment variable is required')
  console.error('       Set it explicitly to prevent accidental production changes')
  console.error('       Example: API_URL=http://localhost:8787')
  process.exit(1)
}

if (!API_KEY) {
  console.error('Error: API_KEY or API_KEY_WRITER environment variable is required')
  console.error('       Set it in .env file or pass via environment')
  process.exit(1)
}

const SEED_DATA_PATH = path.join(__dirname, 'seed-data.json')

async function loadSeedData(): Promise<SeedDocument[]> {
  const raw = fs.readFileSync(SEED_DATA_PATH, 'utf-8')
  return JSON.parse(raw) as SeedDocument[]
}

async function deleteDocument(id: string): Promise<boolean> {
  const url = `${API_URL}/v1/documents/${encodeURIComponent(id)}`

  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${API_KEY}`
    }
  })

  if (res.ok) {
    console.log(`  ✓ Deleted: ${id}`)
    return true
  } else if (res.status === 404) {
    console.log(`  - Not found (skip): ${id}`)
    return true
  } else {
    const text = await res.text()
    console.error(`  ✗ Failed to delete ${id}: ${res.status} ${text}`)
    return false
  }
}

async function indexDocument(doc: SeedDocument): Promise<boolean> {
  const url = `${API_URL}/v1/documents`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(doc)
  })

  if (res.ok) {
    console.log(`  ✓ Indexed: ${doc.id}`)
    return true
  } else {
    const text = await res.text()
    console.error(`  ✗ Failed to index ${doc.id}: ${res.status} ${text}`)
    return false
  }
}

async function main() {
  const args = process.argv.slice(2)
  const shouldClean = args.includes('--clean')

  console.log(`\n🔄 Reindex Script`)
  console.log(`   API: ${API_URL}`)
  console.log(`   Clean mode: ${shouldClean ? 'yes' : 'no'}`)
  console.log('')

  const documents = await loadSeedData()
  console.log(`📄 Loaded ${documents.length} documents from seed-data.json\n`)

  if (shouldClean) {
    console.log('🗑️  Deleting existing documents...')
    for (const doc of documents) {
      await deleteDocument(doc.id)
    }
    console.log('')
  }

  console.log('📥 Indexing documents...')
  let success = 0
  let failed = 0

  for (const doc of documents) {
    const ok = await indexDocument(doc)
    if (ok) {
      success++
    } else {
      failed++
    }
  }

  console.log('')
  console.log(`✅ Done: ${success} indexed, ${failed} failed`)

  if (failed > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
