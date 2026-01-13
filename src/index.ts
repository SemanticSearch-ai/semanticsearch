import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { swaggerUI } from '@hono/swagger-ui'
import { createRoute } from '@hono/zod-openapi'
import { z } from 'zod'
import { DocumentEndpoints } from './application/endpoints/documentEndpoints'
import { DocumentService } from './services/documentService'
import { CloudflareDocumentRepository } from './infrastructure/semanticSearch/cloudflareDocumentRepository'
import { auth, requireWriter } from './middleware/auth'
import { Env } from './types'

const app = new OpenAPIHono<{ Bindings: Env }>()

const createDependencies = (env: Env) => {
  const repository = new CloudflareDocumentRepository(env)
  const service = new DocumentService(repository)
  return new DocumentEndpoints(service)
}

app.use('/*', cors())

app.use('/v1/*', auth())
app.use('/v1/documents', requireWriter({ methods: ['POST'] }))
app.use('/v1/documents/:id', requireWriter({ methods: ['DELETE'] }))

const documentSchema = z.object({
  id: z.string().optional(),
  text: z.string(),
  metadata: z.record(z.any()).optional()
})

const searchQuerySchema = z.object({
  query: z.string(),
  limit: z.number().optional()
})

const searchResultSchema = z.object({
  results: z.array(z.object({
    document: documentSchema,
    score: z.number()
  }))
})

const indexRoute = createRoute({
  method: 'post',
  path: '/v1/documents',
  request: {
    body: {
      content: {
        'application/json': {
          schema: documentSchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            id: z.string()
          })
        }
      },
      description: 'Document indexed successfully'
    },
    400: {
      content: {
        'application/json': {
          schema: z.object({
            error: z.string()
          })
        }
      },
      description: 'Bad request'
    }
  }
})

const getDocumentRoute = createRoute({
  method: 'get',
  path: '/v1/documents/:id',
  request: {
    params: z.object({
      id: z.string()
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: documentSchema
        }
      },
      description: 'Document retrieved successfully'
    },
    404: {
      content: {
        'application/json': {
          schema: z.object({
            error: z.string()
          })
        }
      },
      description: 'Document not found'
    }
  }
})

const deleteDocumentRoute = createRoute({
  method: 'delete',
  path: '/v1/documents/:id',
  request: {
    params: z.object({
      id: z.string()
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean()
          })
        }
      },
      description: 'Document deleted successfully'
    },
    404: {
      content: {
        'application/json': {
          schema: z.object({
            error: z.string()
          })
        }
      },
      description: 'Document not found'
    },
    400: {
      content: {
        'application/json': {
          schema: z.object({
            error: z.string()
          })
        }
      },
      description: 'Bad request'
    }
  }
})

const searchRoute = createRoute({
  method: 'post',
  path: '/v1/search',
  request: {
    body: {
      content: {
        'application/json': {
          schema: searchQuerySchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: searchResultSchema
        }
      },
      description: 'Search completed successfully'
    },
    400: {
      content: {
        'application/json': {
          schema: z.object({
            error: z.string()
          })
        }
      },
      description: 'Bad request'
    }
  }
})

app.openapi(indexRoute, async (c) => {
  const currentEnv = c.env
  const documentEndpoints = createDependencies(currentEnv)
  const result = await documentEndpoints.indexDocument(c)
  return result
})

app.openapi(getDocumentRoute, async (c) => {
  const currentEnv = c.env
  const documentEndpoints = createDependencies(currentEnv)
  const result = await documentEndpoints.getDocument(c)
  return result
})

app.openapi(deleteDocumentRoute, async (c) => {
  const currentEnv = c.env
  const documentEndpoints = createDependencies(currentEnv)
  const result = await documentEndpoints.deleteDocument(c)
  return result
})

app.openapi(searchRoute, async (c) => {
  const currentEnv = c.env
  const documentEndpoints = createDependencies(currentEnv)
  const result = await documentEndpoints.searchDocuments(c)
  return result
})

// Add Swagger UI
app.doc('/swagger.json', {
  openapi: '3.0.0',
  info: {
    title: 'Semantic Search API',
    version: '1.0.0',
    description: 'API for semantic search functionality'
  }
})

app.get('/', swaggerUI({ url: '/swagger.json' }))

export default app
