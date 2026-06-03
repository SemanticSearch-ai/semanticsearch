import { CloudflareSemanticSearchAdapter } from '../cloudflareAdapter'
import { Env } from '../../../types'

describe('CloudflareSemanticSearchAdapter', () => {
  let adapter: CloudflareSemanticSearchAdapter
  let mockEnv: jest.Mocked<Env>

  beforeEach(() => {
    mockEnv = {
      VECTORIZE: {
        insert: jest.fn(),
        upsert: jest.fn(),
        query: jest.fn(),
        getByIds: jest.fn(),
        deleteByIds: jest.fn()
      } as any,
      AI: {
        run: jest.fn()
      } as any,
      // Blog deployment config: qwen3-embedding-0.6b at its native 1024 dims.
      EMBEDDING_MODEL: '@cf/qwen/qwen3-embedding-0.6b',
      EMBEDDING_DIM: '1024'
    } as jest.Mocked<Env>

    adapter = new CloudflareSemanticSearchAdapter(mockEnv)

  })

  describe('generateEmbedding', () => {
    it('should generate embedding for text', async () => {
      const text = 'test text'
      const embedding = Array.from({ length: 1024 }, (_, index) => index / 1000)
      const mockRun = mockEnv.AI.run as jest.Mock
      mockRun.mockResolvedValue({ data: [embedding] })

      const result = await adapter.generateEmbedding(text)

      expect(result).toEqual(embedding)
      expect(result).toHaveLength(1024)
      expect(mockRun).toHaveBeenCalledWith('@cf/qwen/qwen3-embedding-0.6b', { text: [text] })
    })

    it('should fall back to embeddinggemma-300m at 256 dims when no embedding env vars are set', async () => {
      const defaultEnv = {
        VECTORIZE: {
          insert: jest.fn(),
          upsert: jest.fn(),
          query: jest.fn(),
          getByIds: jest.fn(),
          deleteByIds: jest.fn()
        } as any,
        AI: {
          run: jest.fn()
        } as any
      } as jest.Mocked<Env>
      const defaultAdapter = new CloudflareSemanticSearchAdapter(defaultEnv)
      // embeddinggemma-300m outputs 768 dims; the adapter must truncate to the default 256.
      const embedding = Array.from({ length: 768 }, (_, index) => index / 1000)
      const mockRun = defaultEnv.AI.run as jest.Mock
      mockRun.mockResolvedValue({ data: [embedding] })

      const result = await defaultAdapter.generateEmbedding('test text')

      expect(result).toEqual(embedding.slice(0, 256))
      expect(result).toHaveLength(256)
      expect(mockRun).toHaveBeenCalledWith('@cf/google/embeddinggemma-300m', { text: ['test text'] })
    })

    it('should handle invalid AI response', async () => {
      const mockRun = mockEnv.AI.run as jest.Mock
      mockRun.mockResolvedValue({ data: 'invalid' })

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      
      await expect(adapter.generateEmbedding('test')).rejects.toThrow('Invalid response from AI.run')
      
      consoleErrorSpy.mockRestore()
    })
  })

  describe('upsertVector', () => {
    it('should upsert vector with metadata', async () => {
      const mockUpsert = mockEnv.VECTORIZE.upsert as jest.Mock
      mockUpsert.mockResolvedValue(undefined)

      const id = 'test-id'
      const vector = [0.1, 0.2, 0.3]
      const metadata = { key: 'value' }

      await adapter.upsertVector(id, vector, metadata)

      expect(mockUpsert).toHaveBeenCalledWith([{
        id,
        values: vector,
        metadata
      }])
    })

    it('should handle upsert errors', async () => {
      const mockUpsert = mockEnv.VECTORIZE.upsert as jest.Mock
      mockUpsert.mockRejectedValue(new Error('Upsert error'))

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      
      await expect(adapter.upsertVector('test-id', [0.1])).rejects.toThrow('Failed to upsert vector')
      
      consoleErrorSpy.mockRestore()
    })
  })

  describe('deleteVector', () => {
    it('should delete vector by id', async () => {
      const mockDeleteByIds = mockEnv.VECTORIZE.deleteByIds as jest.Mock
      mockDeleteByIds.mockResolvedValue(undefined)

      await adapter.deleteVector('test-id')

      expect(mockDeleteByIds).toHaveBeenCalledWith(['test-id'])
    })

    it('should handle delete errors', async () => {
      const mockDeleteByIds = mockEnv.VECTORIZE.deleteByIds as jest.Mock
      mockDeleteByIds.mockRejectedValue(new Error('Delete error'))

      await expect(adapter.deleteVector('test-id')).rejects.toThrow('Failed to delete vector')
    })
  })

  describe('queryById', () => {
    it('should return vector by id', async () => {
      const vector = {
        id: 'test-id',
        values: [0.1, 0.2, 0.3],
        metadata: { key: 'value' }
      }
      const mockGetByIds = mockEnv.VECTORIZE.getByIds as jest.Mock
      mockGetByIds.mockResolvedValue([vector])

      const result = await adapter.queryById('test-id')

      expect(result).toEqual({
        id: vector.id,
        score: 1.0,
        metadata: vector.metadata
      })
      expect(mockGetByIds).toHaveBeenCalledWith(['test-id'])
    })

    it('should return null if vector not found', async () => {
      const mockGetByIds = mockEnv.VECTORIZE.getByIds as jest.Mock
      mockGetByIds.mockResolvedValue([])

      const result = await adapter.queryById('test-id')

      expect(result).toBeNull()
      expect(mockGetByIds).toHaveBeenCalledWith(['test-id'])
    })

    it('should handle query errors', async () => {
      const mockGetByIds = mockEnv.VECTORIZE.getByIds as jest.Mock
      mockGetByIds.mockRejectedValue(new Error('Query error'))

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      
      await expect(adapter.queryById('test-id')).rejects.toThrow('Failed to query vector by ID')
      
      consoleErrorSpy.mockRestore()
    })
  })

  describe('query', () => {
    it('should query vectors with limit', async () => {
      const queryVector = [0.1, 0.2, 0.3]
      const matches = [
        { id: 'id1', score: 0.9, metadata: { key: 'value1' } },
        { id: 'id2', score: 0.8, metadata: { key: 'value2' } }
      ]
      const mockQuery = mockEnv.VECTORIZE.query as jest.Mock
      mockQuery.mockResolvedValue({ matches })

      const result = await adapter.query(queryVector, 2)

      expect(result).toEqual(matches)
      expect(mockQuery).toHaveBeenCalledWith(queryVector, { topK: 2, returnMetadata: "all" })
    })

    it('should handle query errors', async () => {
      const mockQuery = mockEnv.VECTORIZE.query as jest.Mock
      mockQuery.mockRejectedValue(new Error('Query error'))

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      
      await expect(adapter.query([0.1])).rejects.toThrow('Failed to query vectors')
      
      consoleErrorSpy.mockRestore()
    })
  })
})
