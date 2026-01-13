import { Context } from 'hono'
import { auth, requireWriter } from '../auth'

describe('auth middleware', () => {
  let mockContext: Partial<Context>
  let next: jest.Mock

  const env = {
    API_KEY: 'legacy-writer-key',
    API_KEY_WRITER: 'writer-key',
    API_KEY_READER: 'reader-key'
  } as any

  beforeEach(() => {
    mockContext = {
      env,
      req: {
        header: jest.fn(),
        method: 'POST'
      } as any,
      json: jest.fn(),
      set: jest.fn()
    }

    next = jest.fn()
  })

  it('allows requests authorized via API_KEY_WRITER', async () => {
    ;(mockContext.req!.header as jest.Mock).mockReturnValue('Bearer writer-key')

    await auth()(mockContext as Context, next)

    expect(mockContext.set).toHaveBeenCalledWith('authRole', 'writer')
    expect(next).toHaveBeenCalled()
  })

  it('allows requests authorized via legacy API_KEY', async () => {
    ;(mockContext.req!.header as jest.Mock).mockReturnValue('Bearer legacy-writer-key')

    await auth()(mockContext as Context, next)

    expect(mockContext.set).toHaveBeenCalledWith('authRole', 'writer')
    expect(next).toHaveBeenCalled()
  })

  it('allows requests authorized via API_KEY_READER', async () => {
    ;(mockContext.req!.header as jest.Mock).mockReturnValue('Bearer reader-key')

    await auth()(mockContext as Context, next)

    expect(mockContext.set).toHaveBeenCalledWith('authRole', 'reader')
    expect(next).toHaveBeenCalled()
  })

  it('rejects requests with invalid tokens', async () => {
    ;(mockContext.req!.header as jest.Mock).mockReturnValue('Bearer invalid-token')

    await auth()(mockContext as Context, next)

    expect(next).not.toHaveBeenCalled()
    expect(mockContext.json).toHaveBeenCalledWith({ error: 'Unauthorized' }, 401)
  })

  it('rejects requests without authorization header', async () => {
    ;(mockContext.req!.header as jest.Mock).mockReturnValue(null)

    await auth()(mockContext as Context, next)

    expect(next).not.toHaveBeenCalled()
    expect(mockContext.json).toHaveBeenCalledWith({ error: 'Unauthorized' }, 401)
  })

  it('rejects requests that do not use the Bearer scheme', async () => {
    ;(mockContext.req!.header as jest.Mock).mockReturnValue('Basic sometoken')

    await auth()(mockContext as Context, next)

    expect(next).not.toHaveBeenCalled()
    expect(mockContext.json).toHaveBeenCalledWith({ error: 'Unauthorized' }, 401)
  })
})

describe('requireWriter middleware', () => {
  it('blocks reader keys for protected methods', async () => {
    const context = {
      req: { method: 'POST' },
      get: jest.fn().mockReturnValue('reader'),
      json: jest.fn()
    } as any

    const next = jest.fn()

    await requireWriter({ methods: ['POST'] })(context as Context, next)

    expect(context.json).toHaveBeenCalledWith(
      { error: 'Writer key required for this endpoint' },
      403
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('allows writer keys for protected methods', async () => {
    const context = {
      req: { method: 'DELETE' },
      get: jest.fn().mockReturnValue('writer'),
      json: jest.fn()
    } as any

    const next = jest.fn()

    await requireWriter({ methods: ['DELETE'] })(context as Context, next)

    expect(next).toHaveBeenCalled()
    expect(context.json).not.toHaveBeenCalled()
  })

  it('skips checks when the method is not listed', async () => {
    const context = {
      req: { method: 'GET' },
      get: jest.fn(),
      json: jest.fn()
    } as any

    const next = jest.fn()

    await requireWriter({ methods: ['POST'] })(context as Context, next)

    expect(next).toHaveBeenCalled()
    expect(context.json).not.toHaveBeenCalled()
  })
})
