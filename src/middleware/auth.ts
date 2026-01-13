import { Context, MiddlewareHandler } from 'hono'
import { Env } from '../types'

type AuthRole = 'reader' | 'writer'

declare module 'hono' {
  interface ContextVariableMap {
    authRole?: AuthRole
  }
}

const parseKeyList = (raw?: string): string[] => {
  if (!raw) {
    return []
  }

  return raw
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean)
}

const buildKeySets = (env: Env) => {
  const writerKeys = new Set([
    ...parseKeyList(env.API_KEY_WRITER),
    ...parseKeyList(env.API_KEY)
  ])

  const readerKeys = new Set(parseKeyList(env.API_KEY_READER))

  return { writerKeys, readerKeys }
}

const unauthorized = (c: Context) => c.json({ error: 'Unauthorized' }, 401)

export const auth = (): MiddlewareHandler<{ Bindings: Env }> => {
  return async (c: Context<{ Bindings: Env }>, next) => {
    const authHeader = c.req.header('Authorization')

    if (!authHeader) {
      return unauthorized(c)
    }

    const [scheme, token] = authHeader.split(' ')

    if (scheme !== 'Bearer' || !token) {
      return unauthorized(c)
    }

    const { writerKeys, readerKeys } = buildKeySets(c.env)

    if (writerKeys.size === 0 && readerKeys.size === 0) {
      return unauthorized(c)
    }

    if (writerKeys.has(token)) {
      c.set('authRole', 'writer')
      await next()
      return
    }

    if (readerKeys.has(token)) {
      c.set('authRole', 'reader')
      await next()
      return
    }

    return unauthorized(c)
  }
}

interface RequireWriterOptions {
  methods?: string[]
}

export const requireWriter = (options?: RequireWriterOptions): MiddlewareHandler => {
  const methods = options?.methods?.map((method) => method.toUpperCase())

  return async (c: Context, next) => {
    const currentMethod = c.req.method.toUpperCase()

    if (methods && !methods.includes(currentMethod)) {
      await next()
      return
    }

    if (c.get('authRole') !== 'writer') {
      return c.json({ error: 'Writer key required for this endpoint' }, 403)
    }

    await next()
  }
}
