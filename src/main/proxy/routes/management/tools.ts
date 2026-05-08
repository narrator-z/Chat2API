/**
 * Management API - Tool Registry Routes
 * Provides tool registry management endpoints
 */

import Router from '@koa/router'
import type { Context } from 'koa'
import { managementAuthMiddleware } from '../../middleware/managementAuth'
import { toolRegistry } from '../../services/toolRegistry'
import type { ManagementApiResponse } from '../../../../shared/types'

const router = new Router({ prefix: '/v0/management/tools' })

router.use(managementAuthMiddleware)

// GET /v0/management/tools - List all tools
router.get('/', async (ctx: Context) => {
  try {
    const tools = toolRegistry.getAllTools()
    
    ctx.body = {
      success: true,
      data: {
        tools,
        count: tools.length,
        config: toolRegistry.getConfig(),
      },
    } as ManagementApiResponse<{ tools: any[]; count: number; config: any }>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    ctx.status = 500
    ctx.body = {
      success: false,
      error: {
        code: 'internal_error',
        message: errorMessage,
      },
    } as ManagementApiResponse
  }
})

// GET /v0/management/tools/config - Get tool registry config
router.get('/config', async (ctx: Context) => {
  try {
    const config = toolRegistry.getConfig()
    
    ctx.body = {
      success: true,
      data: config,
    } as ManagementApiResponse<any>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    ctx.status = 500
    ctx.body = {
      success: false,
      error: {
        code: 'internal_error',
        message: errorMessage,
      },
    } as ManagementApiResponse
  }
})

// PUT /v0/management/tools/config - Update tool registry config
router.put('/config', async (ctx: Context) => {
  try {
    const updates = ctx.request.body as {
      enabled?: boolean
      defaultFormat?: 'bracket' | 'xml'
      mergeWithClientTools?: boolean
      priorityMode?: 'registry' | 'client' | 'merge'
    }

    if (!updates || typeof updates !== 'object') {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Request body must be a valid configuration object',
        },
      } as ManagementApiResponse
      return
    }

    toolRegistry.updateConfig(updates)
    const config = toolRegistry.getConfig()

    ctx.body = {
      success: true,
      data: config,
    } as ManagementApiResponse<any>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    ctx.status = 500
    ctx.body = {
      success: false,
      error: {
        code: 'internal_error',
        message: errorMessage,
      },
    } as ManagementApiResponse
  }
})

// POST /v0/management/tools - Add a new tool
router.post('/', async (ctx: Context) => {
  try {
    const tool = ctx.request.body as {
      name: string
      provider?: string
      definition: {
        type: 'function'
        function: {
          name: string
          description?: string
          parameters?: Record<string, any>
        }
      }
      enabled?: boolean
      tags?: string[]
    }

    if (!tool || !tool.name || !tool.definition) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Tool must have name and definition',
        },
      } as ManagementApiResponse
      return
    }

    toolRegistry.setTool({
      id: '',
      name: tool.name,
      provider: tool.provider,
      definition: tool.definition,
      enabled: tool.enabled ?? true,
      tags: tool.tags,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const storedTool = toolRegistry.getTool(tool.name)

    ctx.body = {
      success: true,
      data: storedTool,
    } as ManagementApiResponse<any>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    ctx.status = 500
    ctx.body = {
      success: false,
      error: {
        code: 'internal_error',
        message: errorMessage,
      },
    } as ManagementApiResponse
  }
})

// POST /v0/management/tools/bulk - Bulk add tools
router.post('/bulk', async (ctx: Context) => {
  try {
    const tools = ctx.request.body as Array<{
      name: string
      provider?: string
      definition: {
        type: 'function'
        function: {
          name: string
          description?: string
          parameters?: Record<string, any>
        }
      }
      enabled?: boolean
      tags?: string[]
    }>

    if (!Array.isArray(tools) || tools.length === 0) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: {
          code: 'invalid_request',
          message: 'Request body must be a non-empty array of tools',
        },
      } as ManagementApiResponse
      return
    }

    const entries = tools.map(tool => ({
      id: '',
      name: tool.name,
      provider: tool.provider,
      definition: tool.definition,
      enabled: tool.enabled ?? true,
      tags: tool.tags,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }))

    const result = toolRegistry.importTools(entries)

    ctx.body = {
      success: true,
      data: result,
    } as ManagementApiResponse<{ success: number; failed: number; errors: string[] }>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    ctx.status = 500
    ctx.body = {
      success: false,
      error: {
        code: 'internal_error',
        message: errorMessage,
      },
    } as ManagementApiResponse
  }
})

// GET /v0/management/tools/:name - Get a specific tool
router.get('/:name', async (ctx: Context) => {
  try {
    const name = ctx.params.name
    const tool = toolRegistry.getTool(name)

    if (!tool) {
      ctx.status = 404
      ctx.body = {
        success: false,
        error: {
          code: 'tool_not_found',
          message: `Tool '${name}' not found`,
        },
      } as ManagementApiResponse
      return
    }

    ctx.body = {
      success: true,
      data: tool,
    } as ManagementApiResponse<any>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    ctx.status = 500
    ctx.body = {
      success: false,
      error: {
        code: 'internal_error',
        message: errorMessage,
      },
    } as ManagementApiResponse
  }
})

// PUT /v0/management/tools/:name - Update a tool
router.put('/:name', async (ctx: Context) => {
  try {
    const name = ctx.params.name
    const updates = ctx.request.body as {
      name?: string
      provider?: string
      definition?: {
        type: 'function'
        function: {
          name: string
          description?: string
          parameters?: Record<string, any>
        }
      }
      enabled?: boolean
      tags?: string[]
    }

    const tool = toolRegistry.getTool(name)

    if (!tool) {
      ctx.status = 404
      ctx.body = {
        success: false,
        error: {
          code: 'tool_not_found',
          message: `Tool '${name}' not found`,
        },
      } as ManagementApiResponse
      return
    }

    toolRegistry.setTool({
      ...tool,
      ...updates,
    })

    const updatedTool = toolRegistry.getTool(updates.name || name)

    ctx.body = {
      success: true,
      data: updatedTool,
    } as ManagementApiResponse<any>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    ctx.status = 500
    ctx.body = {
      success: false,
      error: {
        code: 'internal_error',
        message: errorMessage,
      },
    } as ManagementApiResponse
  }
})

// DELETE /v0/management/tools/:name - Delete a tool
router.delete('/:name', async (ctx: Context) => {
  try {
    const name = ctx.params.name
    const deleted = toolRegistry.removeTool(name)

    if (!deleted) {
      ctx.status = 404
      ctx.body = {
        success: false,
        error: {
          code: 'tool_not_found',
          message: `Tool '${name}' not found`,
        },
      } as ManagementApiResponse
      return
    }

    ctx.body = {
      success: true,
      data: { deleted: true },
    } as ManagementApiResponse<{ deleted: boolean }>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    ctx.status = 500
    ctx.body = {
      success: false,
      error: {
        code: 'internal_error',
        message: errorMessage,
      },
    } as ManagementApiResponse
  }
})

// DELETE /v0/management/tools - Clear all tools
router.delete('/', async (ctx: Context) => {
  try {
    toolRegistry.clear()

    ctx.body = {
      success: true,
      data: { cleared: true },
    } as ManagementApiResponse<{ cleared: boolean }>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    ctx.status = 500
    ctx.body = {
      success: false,
      error: {
        code: 'internal_error',
        message: errorMessage,
      },
    } as ManagementApiResponse
  }
})

export default router
