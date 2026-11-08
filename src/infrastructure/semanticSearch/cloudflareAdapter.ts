import { Env } from '../../types'

interface VectorizeMatch {
  id: string
  score: number
  metadata?: Record<string, any>
}

/**
 * Workers AI embedding models answer in two shapes:
 *  - `{ data: number[][], shape }` (embeddinggemma-300m, qwen3-embedding, bge-*)
 *  - `[{ embedding: number[], meta_info }]` (embeddinggemma-2)
 * Return the first vector from either, or throw a payload-free error.
 */
function extractEmbedding(response: unknown): number[] {
  const first: unknown = Array.isArray(response)
    ? (response[0] as { embedding?: unknown } | undefined)?.embedding
    : Array.isArray((response as { data?: unknown } | null | undefined)?.data)
      ? (response as { data: unknown[] }).data[0]
      : undefined

  if (!Array.isArray(first) || !first.every((value) => typeof value === 'number')) {
    const shape = Array.isArray(response)
      ? `array(${response.length})`
      : response && typeof response === 'object'
        ? `object{${Object.keys(response).join(',')}}`
        : typeof response
    throw new Error(`Invalid response from AI.run: no embedding vector found (response shape: ${shape})`)
  }

  return first as number[]
}

export class CloudflareSemanticSearchAdapter {
  private readonly env: Env
  private readonly modelName: string
  private readonly dimension: number

  constructor(env: Env) {
    this.env = env
    // Model + output dimension are configured per-deployment via Wrangler vars,
    // so one codebase can serve multiple Vectorize indexes (e.g. the demo on
    // embeddinggemma-2/256 and the blog on qwen3-embedding-0.6b/1024).
    this.modelName = env.EMBEDDING_MODEL || '@cf/google/embeddinggemma-2'
    const configuredDim = parseInt(String(env.EMBEDDING_DIM ?? ''), 10)
    this.dimension = Number.isFinite(configuredDim) && configuredDim > 0 ? configuredDim : 256
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      if (typeof this.env.AI.run !== 'function') {
        throw new Error(`AI.run is not a function. AI binding type: ${typeof this.env.AI}, available properties: ${Object.keys(this.env.AI)}`)
      }

      // the embedding model may not be listed in workers-types, so cast to satisfy the current typings
      const response = await (this.env.AI as any).run(
        this.modelName,
        { text: [text] }
      )

      const embedding = extractEmbedding(response)

      if (embedding.length < this.dimension) {
        throw new Error(`Embedding length ${embedding.length} is smaller than required dimension ${this.dimension}`)
      }

      // Slice to the configured dimension: full vector for native-size indexes,
      // or an MRL-truncated prefix (e.g. embeddinggemma-2 768 -> 256) for smaller ones.
      return embedding.slice(0, this.dimension)
    } catch (error) {
      console.error('Embedding generation error:', error)
      const message = error instanceof Error
        ? `${error.message}\n${error.stack}`
        : String(error)
      throw new Error(`Failed to generate embedding: ${message}`)
    }
  }

  async upsertVector(id: string, vector: number[], metadata?: Record<string, any>): Promise<void> {
    try {
      await this.env.VECTORIZE.upsert([{
        id,
        values: vector,
        metadata
      }])
    } catch (error) {
      throw new Error(`Failed to upsert vector: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async deleteByIds(ids: string[]): Promise<void> {
    try {
      await this.env.VECTORIZE.deleteByIds(ids)
    } catch (error) {
      throw new Error(`Failed to delete vectors: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async deleteVector(id: string): Promise<void> {
    try {
      await this.deleteByIds([id])
    } catch (error) {
      throw new Error(`Failed to delete vector: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async queryById(id: string): Promise<VectorizeMatch | null> {
    try {
      const result = await this.env.VECTORIZE.getByIds([id])
      if (!result || !Array.isArray(result) || result.length === 0) {
        return null
      }
      const vector = result[0]
      return {
        id: vector.id,
        score: 1.0, // For getByIds, we return perfect score since it's an exact match
        metadata: vector.metadata
      }
    } catch (error) {
      throw new Error(`Failed to query vector by ID: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async query(queryVector: number[], limit: number = 10): Promise<VectorizeMatch[]> {
    try {
      const result = await this.env.VECTORIZE.query(queryVector, { topK: limit, returnMetadata: "all" })
      return result.matches
    } catch (error) {
      throw new Error(`Failed to query vectors: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
