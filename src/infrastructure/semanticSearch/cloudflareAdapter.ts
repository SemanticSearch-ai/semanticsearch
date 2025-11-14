import { Env } from '../../types'

interface VectorizeMatch {
  id: string
  score: number
  metadata?: Record<string, any>
}

export class CloudflareSemanticSearchAdapter {
  private readonly env: Env
  private readonly modelName = '@cf/google/embeddinggemma-300m'
  private readonly dimension = 256 // truncate to 256 dims for MRL compatibility

  constructor(env: Env) {
    this.env = env
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      if (typeof this.env.AI.run !== 'function') {
        throw new Error(`AI.run is not a function. AI binding type: ${typeof this.env.AI}, available properties: ${Object.keys(this.env.AI)}`)
      }

      const response = await this.env.AI.run(this.modelName, { text: [text] })
      
      if (!response || !response.data || !Array.isArray(response.data)) {
        throw new Error(`Invalid response from AI.run: ${JSON.stringify(response)}`)
      }
      
      const embedding = response.data[0]

      if (!Array.isArray(embedding)) {
        throw new Error(`Embedding payload is not an array: ${JSON.stringify(embedding)}`)
      }

      if (embedding.length < this.dimension) {
        throw new Error(`Embedding length ${embedding.length} is smaller than required dimension ${this.dimension}`)
      }

      // embeddinggemma outputs 768 dims; truncate to 256 to stay within MRL cap
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
