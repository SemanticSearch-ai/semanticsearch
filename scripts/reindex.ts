#!/usr/bin/env npx ts-node
/**
 * Reindex script for semantic-search demo
 *
 * Usage:
 *   pnpm reindex                              # Local dev (http://localhost:8787)
 *   pnpm reindex --clean                      # Delete existing docs first
 *   pnpm reindex --url https://demo.semanticsearch.ai   # Custom API URL
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

// Allowlist of valid API hosts to prevent SSRF
const ALLOWED_HOSTS = [
  'localhost',
  '127.0.0.1',
  'demo.semanticsearch.ai',
  'api.semanticsearch.ai'
]

// Validate URL against allowlist (SSRF protection)
function validateUrl(urlValue: string): string {
  try {
    const parsed = new URL(urlValue)

    // Only allow http/https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      console.error(`Error: URL must use http: or https: protocol`)
      process.exit(1)
    }

    // Check against allowlist
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      console.error(`Error: URL host '${parsed.hostname}' not in allowlist`)
      console.error(`Allowed hosts: ${ALLOWED_HOSTS.join(', ')}`)
      process.exit(1)
    }

    return urlValue
  } catch {
    console.error(`Error: Invalid URL format: ${urlValue}`)
    process.exit(1)
  }
}

// Parse --url argument or use default
function getApiUrl(): string {
  const args = process.argv.slice(2)
  const urlIndex = args.indexOf('--url')

  if (urlIndex !== -1) {
    const urlValue = args[urlIndex + 1]

    // Check if --url is missing a value or has another flag as value
    if (!urlValue || urlValue.startsWith('--')) {
      console.error('Error: --url flag requires a URL value')
      console.error('Usage: pnpm reindex --url https://demo.semanticsearch.ai')
      process.exit(1)
    }

    return validateUrl(urlValue)
  }

  // Default: validate env var or use localhost
  const defaultUrl = process.env.API_URL || 'http://localhost:8787'
  return validateUrl(defaultUrl)
}

const API_URL = getApiUrl()
const API_KEY = process.env.API_KEY || process.env.API_KEY_WRITER

if (!API_KEY) {
  console.error('Error: API_KEY or API_KEY_WRITER environment variable is required')
  console.error('       Set it in .env file or pass via environment')
  process.exit(1)
}

const SEED_DATA_PATH = path.join(__dirname, 'seed-data.json')

async function loadSeedData(): Promise<SeedDocument[]> {
  try {
    const raw = fs.readFileSync(SEED_DATA_PATH, 'utf-8')
    const data = JSON.parse(raw)

    if (!Array.isArray(data)) {
      throw new Error('Seed data must be an array of documents')
    }

    return data as SeedDocument[]
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error(`Error: Failed to parse ${SEED_DATA_PATH}`)
      console.error(`       JSON syntax error: ${error.message}`)
    } else if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(`Error: Seed data file not found: ${SEED_DATA_PATH}`)
    } else {
      console.error(`Error loading seed data: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exit(1)
  }
}

async function deleteDocument(id: string): Promise<boolean> {
  const url = `${API_URL}/v1/documents/${encodeURIComponent(id)}`

  try {
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
  } catch (error) {
    console.error(`  ✗ Network error deleting ${id}: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

async function indexDocument(doc: SeedDocument): Promise<boolean> {
  const url = `${API_URL}/v1/documents`

  try {
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
  } catch (error) {
    console.error(`  ✗ Network error indexing ${doc.id}: ${error instanceof Error ? error.message : String(error)}`)
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
