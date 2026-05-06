/**
 * Web API Routes
 * Provides REST API endpoints that mirror Electron IPC handlers
 * Used in Docker/web mode where Electron IPC is not available
 */

import Router from '@koa/router'
import bodyParser from 'koa-bodyparser'
import type { DefaultContext, DefaultState } from 'koa'
import { fileStoreManager } from './store/file-store'
import { ProviderChecker } from './providers/checker'
import { getBuiltinProviders, getBuiltinProvider } from './providers/builtin'
import { proxyServer } from './proxy/server'
import { proxyStatusManager } from './proxy/status'
import { sessionManager } from './proxy/sessionManager'
import { generateManagementSecret } from './proxy/middleware/managementAuth'
import type { Provider, AuthType, Account } from './store/types'
import type { CredentialField } from './store/types'

const router = new Router<DefaultState, DefaultContext>({ prefix: '/manage' })

// Ensure fileStoreManager is initialized before handling any request
// This is a safety net in case initialize() wasn't called yet
async function ensureInitialized(ctx: any, next: any): Promise<void> {
  if (!fileStoreManager.checkInitialized()) {
    console.warn('[WebAPI] fileStoreManager not initialized, initializing now...')
    await fileStoreManager.initialize()
    console.warn('[WebAPI] fileStoreManager initialized by request handler')
  }
  await next()
}

// Helper: wrap async handler and respond with JSON
function jsonOk(ctx: any, data: unknown) {
  ctx.status = 200
  ctx.body = { ok: true, data }
}

function jsonError(ctx: any, message: string, status = 500) {
  ctx.status = status
  ctx.body = { ok: false, error: message }
}

// ==================== Proxy ====================

router.get('/proxy/status', async (ctx) => {
  const port = proxyStatusManager.getPort()
  const stats = proxyStatusManager.getStatistics()
  const running = proxyStatusManager.getRunningStatus()
  jsonOk(ctx, {
    isRunning: running.isRunning,
    port,
    uptime: running.uptime,
    connections: stats.activeConnections,
  })
})

router.post('/proxy/start', async (ctx) => {
  const body = ctx.request.body as any
  const config = fileStoreManager.getConfig()
  const port = body?.port || config.proxyPort || 8088
  const host = config.proxyHost || '0.0.0.0'
  try {
    const success = await proxyServer.start(port, host)
    jsonOk(ctx, success)
  } catch (e: any) {
    jsonError(ctx, e?.message || 'Failed to start proxy')
  }
})

router.post('/proxy/stop', async (ctx) => {
  try {
    const success = await proxyServer.stop()
    jsonOk(ctx, success)
  } catch (e: any) {
    jsonError(ctx, e?.message || 'Failed to stop proxy')
  }
})

router.get('/proxy/statistics', async (ctx) => {
  const stats = proxyStatusManager.getStatistics()
  jsonOk(ctx, stats)
})

// ==================== Config ====================

router.get('/config', async (ctx) => {
  jsonOk(ctx, fileStoreManager.getConfig())
})

router.post('/config', async (ctx) => {
  const updates = ctx.request.body as any
  fileStoreManager.updateConfig(updates)
  jsonOk(ctx, fileStoreManager.getConfig())
})

// ==================== Custom Provider Validation (inline) ====================

interface CustomProviderData {
  id?: string
  name: string
  type?: 'builtin' | 'custom'
  authType: AuthType
  apiEndpoint: string
  headers?: Record<string, string>
  description?: string
  icon?: string
  supportedModels?: string[]
  credentialFields?: CredentialField[]
}

function validateCustomProvider(data: CustomProviderData): { valid: boolean, errors: string[] } {
  const errors: string[] = []

  if (!data.name || data.name.trim().length === 0) {
    errors.push('Provider name cannot be empty')
  }

  if (data.name && data.name.length > 50) {
    errors.push('Provider name cannot exceed 50 characters')
  }

  const existing = fileStoreManager.getProviders()
  const duplicate = existing.find(p => p.name.toLowerCase() === data.name.toLowerCase())
  if (duplicate && duplicate.id !== data.id) {
    errors.push('Provider name already exists')
  }

  if (!data.apiEndpoint || data.apiEndpoint.trim().length === 0) {
    errors.push('API endpoint cannot be empty')
  } else {
    try {
      new URL(data.apiEndpoint)
    } catch {
      errors.push('Invalid API endpoint format')
    }
    if (!data.apiEndpoint.startsWith('http://') && !data.apiEndpoint.startsWith('https://')) {
      errors.push('API endpoint must start with http:// or https://')
    }
  }

  return { valid: errors.length === 0, errors }
}

// ==================== Providers ====================

router.get('/providers', async (ctx) => {
  jsonOk(ctx, fileStoreManager.getProviders())
})

router.get('/providers/builtin', async (ctx) => {
  jsonOk(ctx, getBuiltinProviders())
})

router.post('/providers', async (ctx) => {
  const data = ctx.request.body as any
  try {
    // Check if a provider with the same ID already exists
    if (data.id) {
      const existing = fileStoreManager.getProviderById(data.id)
      if (existing) {
        return jsonOk(ctx, existing)
      }
    }

    const validation = validateCustomProvider(data)
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`)
    }

    const now = Date.now()
    const provider: Provider = {
      id: data.id || fileStoreManager.generateId(),
      name: data.name.trim(),
      type: data.type || 'custom',
      authType: data.authType,
      apiEndpoint: data.apiEndpoint.trim(),
      headers: data.headers || {},
      enabled: true,
      createdAt: now,
      updatedAt: now,
      description: data.description?.trim(),
      icon: data.icon?.trim(),
      supportedModels: data.supportedModels || [],
      credentialFields: data.credentialFields,
    }

    fileStoreManager.addProvider(provider)
    fileStoreManager.addLog('info', `Created provider: ${provider.name}`, { providerId: provider.id })
    jsonOk(ctx, provider)
  } catch (e: any) {
    jsonError(ctx, e?.message || 'Failed to create provider')
  }
})

router.put('/config', async (ctx) => {
  const updates = ctx.request.body as any
  fileStoreManager.updateConfig(updates)
  jsonOk(ctx, true)
})

router.put('/providers/:id', async (ctx) => {
  const { id } = ctx.params
  const updates = ctx.request.body as any
  try {
    const existing = fileStoreManager.getProviderById(id)
    if (!existing) {
      return jsonError(ctx, 'Provider not found', 404)
    }
    if (existing.type === 'builtin') {
      throw new Error('Cannot modify built-in provider')
    }

    if (updates.name && updates.name !== existing.name) {
      const validation = validateCustomProvider({ ...existing, ...updates, id })
      if (!validation.valid) {
        throw new Error(validation.errors.join(', '))
      }
    }

    const updated = fileStoreManager.updateProvider(id, { ...updates, updatedAt: Date.now() })
    if (updated) {
      fileStoreManager.addLog('info', `Updated custom provider: ${existing.name}`, { providerId: id })
    }
    jsonOk(ctx, updated)
  } catch (e: any) {
    jsonError(ctx, e?.message || 'Failed to update provider')
  }
})

router.delete('/providers/:id', async (ctx) => {
  const { id } = ctx.params
  try {
    const provider = fileStoreManager.getProviderById(id)
    if (!provider) {
      return jsonError(ctx, 'Provider not found', 404)
    }

    // Delete all accounts for this provider first
    const accounts = fileStoreManager.getAccountsByProviderId(id)
    for (const account of accounts) {
      fileStoreManager.deleteAccount(account.id)
    }

    const result = fileStoreManager.deleteProvider(id)
    if (result) {
      fileStoreManager.addLog('info', `Deleted provider: ${provider.name}`, { providerId: id })
    }
    jsonOk(ctx, result)
  } catch (e: any) {
    jsonError(ctx, e?.message || 'Failed to delete provider')
  }
})

router.post('/providers/:id/check-status', async (ctx) => {
  const { id } = ctx.params
  const provider = fileStoreManager.getProviderById(id)
  if (!provider) {
    return jsonError(ctx, 'Provider not found', 404)
  }
  const result = await ProviderChecker.checkProviderStatus(provider)
  fileStoreManager.updateProvider(id, { status: result.status, lastStatusCheck: Date.now() })
  jsonOk(ctx, result)
})

router.post('/providers/check-all-status', async (ctx) => {
  const providers = fileStoreManager.getProviders()
  const results: Record<string, any> = {}
  await Promise.all(
    providers.map(async (provider) => {
      const result = await ProviderChecker.checkProviderStatus(provider)
      results[provider.id] = result
      fileStoreManager.updateProvider(provider.id, { status: result.status, lastStatusCheck: Date.now() })
    })
  )
  jsonOk(ctx, results)
})

router.post('/providers/:id/duplicate', async (ctx) => {
  const { id } = ctx.params
  try {
    const existing = fileStoreManager.getProviderById(id)
    if (!existing) {
      return jsonError(ctx, 'Provider not found', 404)
    }

    const now = Date.now()
    let newName = `${existing.name} (Copy)`
    let counter = 1
    while (fileStoreManager.getProviders().some(p => p.name.toLowerCase() === newName.toLowerCase())) {
      counter++
      newName = `${existing.name} (Copy ${counter})`
    }

    const newProvider: Provider = {
      id: fileStoreManager.generateId(),
      name: newName,
      type: 'custom',
      authType: existing.authType,
      apiEndpoint: existing.apiEndpoint,
      headers: { ...existing.headers },
      enabled: true,
      createdAt: now,
      updatedAt: now,
      description: existing.description,
      icon: existing.icon,
      supportedModels: existing.supportedModels ? [...existing.supportedModels] : [],
      credentialFields: existing.credentialFields,
    }

    fileStoreManager.addProvider(newProvider)
    fileStoreManager.addLog('info', `Duplicated provider: ${existing.name} -> ${newName}`, { providerId: newProvider.id })
    jsonOk(ctx, newProvider)
  } catch (e: any) {
    jsonError(ctx, e?.message || 'Failed to duplicate provider')
  }
})

router.post('/providers/:id/update-models', async (ctx) => {
  const { id } = ctx.params
  const provider = fileStoreManager.getProviderById(id)
  if (!provider) {
    return jsonError(ctx, 'Provider not found', 404)
  }
  let modelsApiEndpoint: string | undefined
  let modelsApiHeaders: Record<string, string> | undefined
  if (provider.type === 'builtin') {
    const builtinConfig = getBuiltinProvider(id)
    if (builtinConfig) {
      modelsApiEndpoint = builtinConfig.modelsApiEndpoint
      modelsApiHeaders = builtinConfig.modelsApiHeaders
    }
  }
  if (!modelsApiEndpoint) {
    return jsonOk(ctx, { success: false, error: 'This provider does not support dynamic model updates' })
  }
  try {
    const axios = (await import('axios')).default
    const accounts = fileStoreManager.getAccountsByProviderId(id, true)
    const activeAccount = accounts.find((a) => a.status === 'active')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...modelsApiHeaders,
    }
    if (activeAccount?.credentials?.token) headers['Authorization'] = `Bearer ${activeAccount.credentials.token}`
    if (activeAccount?.credentials?.cookies) headers['Cookie'] = activeAccount.credentials.cookies
    const response = await axios.get(modelsApiEndpoint, { headers, timeout: 15000, validateStatus: () => true })
    if (response.status !== 200) {
      return jsonOk(ctx, { success: false, error: `HTTP ${response.status}` })
    }
    const models = response.data.data || response.data
    if (!Array.isArray(models) || models.length === 0) {
      return jsonOk(ctx, { success: false, error: 'No models found' })
    }
    const supportedModels: string[] = []
    const modelMappings: Record<string, string> = {}
    for (const model of models) {
      if (typeof model === 'string') {
        supportedModels.push(model)
        modelMappings[model] = model
      } else if (model && typeof model === 'object') {
        const modelId = model.id || model.model_id || model.name
        const modelName = model.name || model.display_name || modelId
        if (modelId) {
          supportedModels.push(modelName || modelId)
          modelMappings[modelName || modelId] = modelId
        }
      }
    }
    fileStoreManager.updateProvider(id, { supportedModels, modelMappings })
    jsonOk(ctx, { success: true, modelsCount: supportedModels.length })
  } catch (e: any) {
    jsonOk(ctx, { success: false, error: e?.message || 'Failed to update models' })
  }
})

router.get('/providers/:id/effective-models', async (ctx) => {
  const { id } = ctx.params
  try {
    const models = fileStoreManager.getEffectiveModels(id)
    jsonOk(ctx, models)
  } catch (e: any) {
    jsonError(ctx, e?.message || 'Failed to get effective models')
  }
})

router.post('/providers/:id/custom-model', async (ctx) => {
  const { id } = ctx.params
  const body = ctx.request.body as any
  try {
    const models = fileStoreManager.addCustomModel(id, body)
    jsonOk(ctx, { success: true, models })
  } catch (e: any) {
    jsonOk(ctx, { success: false, error: e?.message, models: [] })
  }
})

router.delete('/providers/:id/model/:modelName', async (ctx) => {
  const { id, modelName } = ctx.params
  try {
    const models = fileStoreManager.removeModel(id, decodeURIComponent(modelName))
    jsonOk(ctx, { success: true, models })
  } catch (e: any) {
    jsonOk(ctx, { success: false, error: e?.message, models: [] })
  }
})

router.post('/providers/:id/reset-models', async (ctx) => {
  const { id } = ctx.params
  try {
    const models = fileStoreManager.resetModels(id)
    jsonOk(ctx, { success: true, models })
  } catch (e: any) {
    jsonOk(ctx, { success: false, error: e?.message, models: [] })
  }
})

// ==================== Accounts ====================

router.get('/accounts', async (ctx) => {
  const includeCredentials = ctx.query.includeCredentials === 'true'
  jsonOk(ctx, fileStoreManager.getAccounts(includeCredentials))
})

router.get('/accounts/:id', async (ctx) => {
  const { id } = ctx.params
  const includeCredentials = ctx.query.includeCredentials === 'true'
  const account = fileStoreManager.getAccountById(id, includeCredentials)
  if (!account) return jsonError(ctx, 'Account not found', 404)
  jsonOk(ctx, account)
})

router.get('/providers/:id/accounts', async (ctx) => {
  const { id } = ctx.params
  jsonOk(ctx, fileStoreManager.getAccountsByProviderId(id))
})

router.post('/accounts', async (ctx) => {
  const data = ctx.request.body as any
  try {
    // Ensure provider exists
    const provider = fileStoreManager.getProviderById(data.providerId)
    if (!provider) {
      return jsonError(ctx, `Provider not found: ${data.providerId}`)
    }

    const now = Date.now()
    const account: Account = {
      id: fileStoreManager.generateId(),
      providerId: data.providerId,
      name: data.name,
      email: data.email,
      credentials: data.credentials,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      requestCount: 0,
      todayUsed: 0,
      dailyLimit: data.dailyLimit,
      lastStatusCheck: now,
      lastUsed: now,
    }

    fileStoreManager.addAccount(account)
    fileStoreManager.addLog('info', `Created account: ${account.name}`, {
      accountId: account.id,
      providerId: account.providerId,
    })
    jsonOk(ctx, account)
  } catch (e: any) {
    jsonError(ctx, e?.message || 'Failed to create account')
  }
})

router.put('/accounts/:id', async (ctx) => {
  const { id } = ctx.params
  const updates = ctx.request.body as any
  try {
    const account = fileStoreManager.updateAccount(id, { ...updates, updatedAt: Date.now() })
    if (!account) return jsonError(ctx, 'Account not found', 404)
    jsonOk(ctx, account)
  } catch (e: any) {
    jsonError(ctx, e?.message || 'Failed to update account')
  }
})

router.delete('/accounts/:id', async (ctx) => {
  const { id } = ctx.params
  try {
    const success = fileStoreManager.deleteAccount(id)
    if (!success) return jsonError(ctx, 'Account not found', 404)
    jsonOk(ctx, success)
  } catch (e: any) {
    jsonError(ctx, e?.message || 'Failed to delete account')
  }
})

router.post('/accounts/:id/validate', async (ctx) => {
  const { id } = ctx.params
  try {
    const account = fileStoreManager.getAccountById(id, true)
    if (!account) return jsonError(ctx, 'Account not found', 404)

    const provider = fileStoreManager.getProviderById(account.providerId)
    if (!provider) return jsonError(ctx, 'Provider not found', 404)

    const result = await ProviderChecker.checkAccountToken(provider, account)
    jsonOk(ctx, result.valid)
  } catch (e: any) {
    jsonError(ctx, e?.message || 'Failed to validate account')
  }
})

router.post('/accounts/validate-token', async (ctx) => {
  const { providerId, credentials } = ctx.request.body as any
  let provider = fileStoreManager.getProviderById(providerId)
  if (!provider) {
    const builtinConfig = getBuiltinProvider(providerId)
    if (builtinConfig) {
      provider = {
        id: builtinConfig.id,
        name: builtinConfig.name,
        type: 'builtin',
        authType: builtinConfig.authType,
        apiEndpoint: builtinConfig.apiEndpoint,
        headers: builtinConfig.headers,
        enabled: true,
        description: builtinConfig.description,
        supportedModels: builtinConfig.supportedModels || [],
        modelMappings: builtinConfig.modelMappings || {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    }
  }
  if (!provider) return jsonOk(ctx, { valid: false, error: 'Provider not found' })
  const tempAccount = {
    id: 'temp',
    providerId,
    name: 'temp',
    credentials,
    status: 'active' as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  try {
    const result = await ProviderChecker.checkAccountToken(provider, tempAccount)
    jsonOk(ctx, result)
  } catch (e: any) {
    jsonOk(ctx, { valid: false, error: e?.message })
  }
})

router.post('/accounts/:id/clear-chats', async (ctx) => {
  const { id } = ctx.params
  try {
    const account = fileStoreManager.getAccountById(id, true)
    if (!account) return jsonOk(ctx, { success: false, error: 'Account not found' })
    const provider = fileStoreManager.getProviderById(account.providerId)
    if (!provider) return jsonOk(ctx, { success: false, error: 'Provider not found' })

    const providerAdapterMap: Record<string, string> = {
      'qwen-ai': '../proxy/adapters/qwen-ai',
      'minimax': '../proxy/adapters/minimax',
      'zai': '../proxy/adapters/zai',
      'perplexity': '../proxy/adapters/perplexity',
      'deepseek': '../proxy/adapters/deepseek',
      'glm': '../proxy/adapters/glm',
      'mimo': '../proxy/adapters/mimo',
    }
    const adapterPath = providerAdapterMap[provider.id]
    if (!adapterPath) return jsonOk(ctx, { success: false, error: 'This feature is not available for this provider' })

    const mod = await import(adapterPath)
    const AdapterClass = Object.values(mod)[0] as any
    const adapter = new AdapterClass(provider, account)
    const success = await adapter.deleteAllChats()
    jsonOk(ctx, { success })
  } catch (e: any) {
    jsonOk(ctx, { success: false, error: e?.message })
  }
})

router.get('/accounts/:id/credits', async (ctx) => {
  const { id } = ctx.params
  try {
    const account = fileStoreManager.getAccountById(id, true)
    if (!account) return jsonError(ctx, 'Account not found', 404)

    const provider = fileStoreManager.getProviderById(account.providerId)
    if (!provider) return jsonOk(ctx, null)

    const providerAdapterMap: Record<string, string> = {
      'deepseek': '../proxy/adapters/deepseek',
      'qwen-ai': '../proxy/adapters/qwen-ai',
      'minimax': '../proxy/adapters/minimax',
    }
    const adapterPath = providerAdapterMap[provider.id]
    if (!adapterPath) return jsonOk(ctx, null)

    const mod = await import(adapterPath)
    const AdapterClass = Object.values(mod)[0] as any
    const adapter = new AdapterClass(provider, account)
    const credits = await adapter.getCredits()
    jsonOk(ctx, credits)
  } catch (e: any) {
    jsonOk(ctx, null)
  }
})

// ==================== Logs ====================

router.get('/logs', async (ctx) => {
  const { level, limit } = ctx.query
  const logLevel = level === 'all' ? undefined : (level as any)
  const logs = fileStoreManager.getLogs(limit ? parseInt(limit as string) : undefined, logLevel)
  jsonOk(ctx, logs)
})

router.get('/logs/stats', async (ctx) => {
  jsonOk(ctx, fileStoreManager.getLogStats())
})

router.get('/logs/trend', async (ctx) => {
  const { days } = ctx.query
  jsonOk(ctx, fileStoreManager.getLogTrend(days ? parseInt(days as string) : undefined))
})

router.get('/logs/account/:accountId/trend', async (ctx) => {
  const { accountId } = ctx.params
  const { days } = ctx.query
  jsonOk(ctx, fileStoreManager.getAccountLogTrend(accountId, days ? parseInt(days as string) : undefined))
})

router.get('/logs/:id', async (ctx) => {
  const { id } = ctx.params
  const log = fileStoreManager.getLogById(id)
  if (!log) return jsonError(ctx, 'Log not found', 404)
  jsonOk(ctx, log)
})

router.delete('/logs', async (ctx) => {
  fileStoreManager.clearLogs()
  jsonOk(ctx, true)
})

// ==================== Request Logs ====================

router.get('/request-logs', async (ctx) => {
  const { status, providerId, limit } = ctx.query
  const filter: any = {}
  if (status) filter.status = status
  if (providerId) filter.providerId = providerId
  const logs = fileStoreManager.getRequestLogs(limit ? parseInt(limit as string) : undefined, filter)
  jsonOk(ctx, logs)
})

router.get('/request-logs/stats', async (ctx) => {
  jsonOk(ctx, fileStoreManager.getRequestLogStats())
})

router.get('/request-logs/trend', async (ctx) => {
  const { days } = ctx.query
  jsonOk(ctx, fileStoreManager.getRequestLogTrend(days ? parseInt(days as string) : undefined))
})

router.get('/request-logs/:id', async (ctx) => {
  const { id } = ctx.params
  const log = fileStoreManager.getRequestLogById(id)
  if (!log) return jsonError(ctx, 'Request log not found', 404)
  jsonOk(ctx, log)
})

router.delete('/request-logs', async (ctx) => {
  fileStoreManager.clearRequestLogs()
  jsonOk(ctx, true)
})

// ==================== Statistics ====================

router.get('/statistics', async (ctx) => {
  jsonOk(ctx, fileStoreManager.getStatistics())
})

router.get('/statistics/today', async (ctx) => {
  jsonOk(ctx, fileStoreManager.getTodayStatistics())
})

// ==================== System Prompts ====================

router.get('/prompts', async (ctx) => {
  jsonOk(ctx, fileStoreManager.getSystemPrompts())
})

router.get('/prompts/builtin', async (ctx) => {
  jsonOk(ctx, fileStoreManager.getBuiltinPrompts())
})

router.get('/prompts/custom', async (ctx) => {
  jsonOk(ctx, fileStoreManager.getCustomPrompts())
})

router.get('/prompts/by-type/:type', async (ctx) => {
  const { type } = ctx.params
  jsonOk(ctx, fileStoreManager.getSystemPromptsByType(type as any))
})

router.get('/prompts/:id', async (ctx) => {
  const { id } = ctx.params
  const prompt = fileStoreManager.getSystemPromptById(id)
  if (!prompt) return jsonError(ctx, 'Prompt not found', 404)
  jsonOk(ctx, prompt)
})

router.post('/prompts', async (ctx) => {
  const data = ctx.request.body as any
  try {
    const prompt = fileStoreManager.addSystemPrompt(data)
    jsonOk(ctx, prompt)
  } catch (e: any) {
    jsonError(ctx, e?.message || 'Failed to create prompt')
  }
})

router.put('/prompts/:id', async (ctx) => {
  const { id } = ctx.params
  const updates = ctx.request.body as any
  try {
    const prompt = fileStoreManager.updateSystemPrompt(id, updates)
    jsonOk(ctx, prompt)
  } catch (e: any) {
    jsonError(ctx, e?.message || 'Failed to update prompt')
  }
})

router.delete('/prompts/:id', async (ctx) => {
  const { id } = ctx.params
  try {
    const success = fileStoreManager.deleteSystemPrompt(id)
    jsonOk(ctx, success)
  } catch (e: any) {
    jsonError(ctx, e?.message || 'Failed to delete prompt')
  }
})

// ==================== Sessions ====================

router.get('/sessions/config', async (ctx) => {
  jsonOk(ctx, sessionManager.getSessionConfig())
})

router.put('/sessions/config', async (ctx) => {
  const updates = ctx.request.body as any
  jsonOk(ctx, sessionManager.updateSessionConfig(updates))
})

router.get('/sessions', async (ctx) => {
  jsonOk(ctx, sessionManager.getAllSessions())
})

router.get('/sessions/active', async (ctx) => {
  jsonOk(ctx, sessionManager.getAllActiveSessions())
})

router.get('/sessions/by-account/:accountId', async (ctx) => {
  jsonOk(ctx, sessionManager.getSessionsByAccount(ctx.params.accountId))
})

router.get('/sessions/by-provider/:providerId', async (ctx) => {
  jsonOk(ctx, sessionManager.getSessionsByProvider(ctx.params.providerId))
})

router.get('/sessions/:id', async (ctx) => {
  const session = sessionManager.getSession(ctx.params.id)
  if (!session) return jsonError(ctx, 'Session not found', 404)
  jsonOk(ctx, session)
})

router.delete('/sessions/all', async (ctx) => {
  await sessionManager.clearAllSessions()
  jsonOk(ctx, true)
})

router.post('/sessions/clean-expired', async (ctx) => {
  const count = sessionManager.cleanExpiredSessions()
  jsonOk(ctx, count)
})

router.delete('/sessions/:id', async (ctx) => {
  const success = sessionManager.deleteSession(ctx.params.id)
  jsonOk(ctx, success)
})

// ==================== Management API Config ====================

router.get('/management-api/config', async (ctx) => {
  const config = fileStoreManager.getConfig()
  jsonOk(ctx, (config as any).managementApi || { enableManagementApi: false, managementApiSecret: '' })
})

router.put('/management-api/config', async (ctx) => {
  const updates = ctx.request.body as any
  const config = fileStoreManager.getConfig()
  const current = (config as any).managementApi || {}
  const newConfig = { ...current, ...updates }
  fileStoreManager.updateConfig({ managementApi: newConfig } as any)
  jsonOk(ctx, newConfig)
})

router.post('/management-api/generate-secret', async (ctx) => {
  const newSecret = generateManagementSecret()
  const config = fileStoreManager.getConfig()
  const current = (config as any).managementApi || {}
  fileStoreManager.updateConfig({ managementApi: { ...current, managementApiSecret: newSecret } } as any)
  jsonOk(ctx, newSecret)
})

// ==================== Context Management ====================

router.get('/context-management/config', async (ctx) => {
  const config = fileStoreManager.getConfig()
  jsonOk(ctx, (config as any).contextManagement || {
    enabled: true,
    strategies: {
      slidingWindow: { enabled: true, maxMessages: 20 },
      tokenLimit: { enabled: false, maxTokens: 4000 },
      summary: { enabled: false, keepRecentMessages: 20 },
    },
    executionOrder: ['slidingWindow'],
  })
})

router.put('/context-management/config', async (ctx) => {
  const updates = ctx.request.body as any
  const config = fileStoreManager.getConfig()
  const current = (config as any).contextManagement || {}
  const newConfig = { ...current, ...updates }
  fileStoreManager.updateConfig({ contextManagement: newConfig } as any)
  jsonOk(ctx, newConfig)
})

// ==================== App Info ====================

router.get('/app/version', async (ctx) => {
  // Read from package.json
  try {
    const { readFileSync } = await import('fs')
    const { join, dirname } = await import('path')
    const { fileURLToPath } = await import('url')
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)
    const pkgPath = join(__dirname, '../../package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    jsonOk(ctx, pkg.version || '0.0.0')
  } catch {
    jsonOk(ctx, '0.0.0')
  }
})

// ==================== Provider Export/Import ====================

router.get('/providers/:id/export', async (ctx) => {
  const { id } = ctx.params
  try {
    const provider = fileStoreManager.getProviderById(id)
    if (!provider) return jsonError(ctx, 'Provider not found', 404)

    const exportData = {
      name: provider.name,
      authType: provider.authType,
      apiEndpoint: provider.apiEndpoint,
      headers: provider.headers,
      description: provider.description,
      icon: provider.icon,
      supportedModels: provider.supportedModels,
    }

    jsonOk(ctx, exportData)
  } catch (e: any) {
    jsonError(ctx, e?.message || 'Failed to export provider')
  }
})

router.post('/providers/import', async (ctx) => {
  const { jsonData } = ctx.request.body as any
  try {
    let data: CustomProviderData
    try {
      data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData
    } catch {
      throw new Error('Invalid JSON format')
    }

    // Check if a provider with the same name already exists
    const existing = fileStoreManager.getProviders().find(p => p.name.toLowerCase() === data.name.toLowerCase())
    if (existing) {
      throw new Error(`Provider with name "${data.name}" already exists`)
    }

    const validation = validateCustomProvider(data)
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`)
    }

    const now = Date.now()
    const provider: Provider = {
      id: fileStoreManager.generateId(),
      name: data.name.trim(),
      type: 'custom',
      authType: data.authType,
      apiEndpoint: data.apiEndpoint.trim(),
      headers: data.headers || {},
      enabled: true,
      createdAt: now,
      updatedAt: now,
      description: data.description?.trim(),
      icon: data.icon?.trim(),
      supportedModels: data.supportedModels || [],
    }

    fileStoreManager.addProvider(provider)
    fileStoreManager.addLog('info', `Imported provider: ${provider.name}`, { providerId: provider.id })
    jsonOk(ctx, provider)
  } catch (e: any) {
    jsonError(ctx, e?.message || 'Failed to import provider')
  }
})

export function createWebApiRouter() {
  return {
    routes: () => router.routes(),
    allowedMethods: () => router.allowedMethods(),
    bodyParser: () => bodyParser({ enableTypes: ['json'], jsonLimit: '10mb' }),
    initGuard: () => ensureInitialized,
  }
}
