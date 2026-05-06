/**
 * File-based Storage Module
 * Alternative to electron-store for Docker/web deployment
 * Uses JSON files for persistence without Electron dependencies
 */

import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import {
  StoreSchema,
  AppConfig,
  Account,
  Provider,
  LogEntry,
  DEFAULT_CONFIG,
  BUILTIN_PROVIDERS,
  LogLevel,
  SystemPrompt,
  SessionRecord,
  SessionConfig,
  DEFAULT_SESSION_CONFIG,
  ChatMessage,
  RequestLogEntry,
  RequestLogConfig,
  PersistentStatistics,
  DailyStatistics,
  DEFAULT_STATISTICS,
  EffectiveModel,
  ProviderModelOverrides,
  DEFAULT_USER_MODEL_OVERRIDES,
  UserModelOverrides,
  CustomModel,
  DEFAULT_REQUEST_LOG_CONFIG,
} from './types'
import { BUILTIN_PROMPTS } from '../data/builtin-prompts'
import { RequestLogManager } from '../requestLogs/manager'
import { normalizeRequestLogConfig } from '../requestLogs/types'

// Global singleton instance - ensures same instance across all imports
let _globalFileStoreManager: FileStoreManager | null = null

/**
 * Get or create the global FileStoreManager singleton
 */
function getGlobalFileStoreManager(): FileStoreManager {
  if (!_globalFileStoreManager) {
    _globalFileStoreManager = new FileStoreManager()
  }
  return _globalFileStoreManager
}

/**
 * File-based Store Manager Class
 * Responsible for data persistence using JSON files
 */
class FileStoreManager {
  private static instanceCounter = 0
  private readonly instanceId: number
  private data: StoreSchema | null = null
  private _isInitialized: boolean = false
  private initializationError: Error | null = null
  private requestLogManager: RequestLogManager | null = null
  private pendingLogs: LogEntry[] = []
  private logFlushTimer: NodeJS.Timeout | null = null
  private readonly logFlushDelayMs = 2000
  private dataDir: string = '/app/data'

  constructor() {
    FileStoreManager.instanceCounter++
    this.instanceId = FileStoreManager.instanceCounter
    console.log(`[FileStore] Constructor called, instance #${this.instanceId} created`)
  }

  /**
   * Set data directory
   */
  setDataDir(dir: string): void {
    this.dataDir = dir
  }

  /**
   * Check if storage is initialized
   */
  checkInitialized(): boolean {
    return this._isInitialized
  }

  /**
   * Check if storage has initialization error
   */
  hasInitializationError(): boolean {
    return this.initializationError !== null
  }

  /**
   * Get initialization error
   */
  getInitializationError(): Error | null {
    return this.initializationError
  }

  /**
   * Initialize Storage
   * Load data from JSON files or create default data
   */
  async initialize(): Promise<void> {
    console.log(`[FileStore] initialize() called on instance #${this.instanceId}, _isInitialized:`, this._isInitialized)
    if (this._isInitialized) {
      console.log(`[FileStore] Instance #${this.instanceId} already initialized, skipping`)
      return
    }

    // Ensure data directory exists
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true })
    }

    try {
      this.data = this.loadData()
      await this.initializeRequestLogManager()
      await this.initializeDefaultProviders()
      this._isInitialized = true
      this.initializationError = null
      console.log('[FileStore] Storage initialized successfully')
    } catch (error) {
      console.error('[FileStore] Failed to initialize storage:', error)
      this.initializationError = error instanceof Error ? error : new Error(String(error))
      throw this.initializationError
    }
  }

  /**
   * Load data from JSON file
   */
  private loadData(): StoreSchema {
    const dataPath = join(this.dataDir, 'data.json')
    
    if (existsSync(dataPath)) {
      try {
        const content = readFileSync(dataPath, 'utf-8')
        const parsed = JSON.parse(content)
        return this.mergeWithDefaults(parsed)
      } catch (error) {
        console.error('[FileStore] Failed to load data file, using defaults:', error)
        return this.getDefaultData()
      }
    }
    
    return this.getDefaultData()
  }

  /**
   * Save data to JSON file
   */
  private saveData(): void {
    if (!this.data) {
      return
    }

    const dataPath = join(this.dataDir, 'data.json')
    try {
      writeFileSync(dataPath, JSON.stringify(this.data, null, 2), 'utf-8')
    } catch (error) {
      console.error('[FileStore] Failed to save data:', error)
    }
  }

  /**
   * Merge loaded data with defaults
   */
  private mergeWithDefaults(loaded: any): StoreSchema {
    const defaults = this.getDefaultData()
    return {
      providers: loaded.providers || defaults.providers,
      accounts: loaded.accounts || defaults.accounts,
      config: this.normalizeConfig(loaded.config || defaults.config),
      logs: loaded.logs || defaults.logs,
      requestLogs: loaded.requestLogs || defaults.requestLogs,
      systemPrompts: loaded.systemPrompts || defaults.systemPrompts,
      sessions: loaded.sessions || defaults.sessions,
      statistics: loaded.statistics || defaults.statistics,
      userModelOverrides: loaded.userModelOverrides || defaults.userModelOverrides,
    }
  }

  /**
   * Get Default Data Structure
   */
  private getDefaultData(): StoreSchema {
    return {
      providers: [],
      accounts: [],
      config: DEFAULT_CONFIG,
      logs: [],
      requestLogs: [],
      systemPrompts: [],
      sessions: [],
      statistics: DEFAULT_STATISTICS,
      userModelOverrides: DEFAULT_USER_MODEL_OVERRIDES,
    }
  }

  private normalizeConfig(config: AppConfig): AppConfig {
    return {
      ...DEFAULT_CONFIG,
      ...config,
      requestLogConfig: normalizeRequestLogConfig(
        config.requestLogConfig || DEFAULT_REQUEST_LOG_CONFIG,
      ),
    }
  }

  private async initializeRequestLogManager(): Promise<void> {
    const config = this.normalizeConfig(this.data?.config || DEFAULT_CONFIG)
    this.requestLogManager = new RequestLogManager({
      storageDir: join(this.dataDir, 'request-logs'),
      config: config.requestLogConfig,
    })
    await this.requestLogManager.initialize()

    const legacyRequestLogs = this.data?.requestLogs || []
    if (legacyRequestLogs.length > 0) {
      await this.requestLogManager.migrateLegacyLogs(legacyRequestLogs)
      this.data!.requestLogs = []
      this.saveData()
    }
  }

  /**
   * Initialize Default Providers
   * Validates and updates builtin provider configurations
   */
  private async initializeDefaultProviders(): Promise<void> {
    // Only process if there are no custom providers
    // This preserves user-added custom providers
    const providers = this.data?.providers || []
    const builtinIds = BUILTIN_PROVIDERS.map(p => p.id)

    // Get builtin providers from stored data
    const storedBuiltins = providers.filter((p: Provider) => p.type === 'builtin')
    const customProviders = providers.filter((p: Provider) => p.type === 'custom')

    // Update builtin providers with latest configuration
    const updatedBuiltins = storedBuiltins.map((p: Provider) => {
      const builtinConfig = BUILTIN_PROVIDERS.find(bp => bp.id === p.id)
      if (builtinConfig) {
        return {
          ...p,
          apiEndpoint: builtinConfig.apiEndpoint,
          chatPath: builtinConfig.chatPath,
          supportedModels: builtinConfig.supportedModels,
          modelMappings: builtinConfig.modelMappings,
          headers: builtinConfig.headers,
          description: builtinConfig.description,
        }
      }
      return p
    })

    // Merge updated builtins with custom providers
    this.data!.providers = [...updatedBuiltins, ...customProviders]
  }

  /**
   * Ensure provider exists, create if not
   */
  ensureProviderExists(providerId: string): void {
    this.ensureInitialized()
    const providers = this.data!.providers || []
    const exists = providers.some((p: Provider) => p.id === providerId)
    
    if (!exists) {
      const builtinConfig = BUILTIN_PROVIDERS.find(bp => bp.id === providerId)
      if (builtinConfig) {
        const now = Date.now()
        const newProvider: Provider = {
          id: builtinConfig.id,
          name: builtinConfig.name,
          type: 'builtin',
          authType: builtinConfig.authType,
          apiEndpoint: builtinConfig.apiEndpoint,
          chatPath: builtinConfig.chatPath,
          headers: builtinConfig.headers,
          enabled: true,
          createdAt: now,
          updatedAt: now,
          description: builtinConfig.description,
          supportedModels: builtinConfig.supportedModels,
          modelMappings: builtinConfig.modelMappings,
        }
        providers.push(newProvider)
        this.data!.providers = providers
        this.saveData()
        console.log('[FileStore] Created missing provider:', providerId)
      }
    }
  }

  /**
   * Ensure Storage is Initialized
   */
  private ensureInitialized(): void {
    if (!this._isInitialized || !this.data) {
      const errorMsg = this.initializationError 
        ? `Storage initialization failed: ${this.initializationError.message}`
        : 'Storage not initialized, please call initialize() first'
      throw new Error(errorMsg)
    }
  }

  private getLogPriority(level: LogLevel): number {
    switch (level) {
      case 'debug':
        return 10
      case 'info':
        return 20
      case 'warn':
        return 30
      case 'error':
        return 40
      default:
        return 20
    }
  }

  private shouldRecordLog(level: LogLevel): boolean {
    const config = this.normalizeConfig(this.data!.config || DEFAULT_CONFIG)
    return this.getLogPriority(level) >= this.getLogPriority(config.logLevel)
  }

  private scheduleLogFlush(): void {
    if (this.logFlushTimer) {
      clearTimeout(this.logFlushTimer)
    }

    this.logFlushTimer = setTimeout(() => {
      this.logFlushTimer = null
      this.flushLogsSync()
    }, this.logFlushDelayMs)
  }

  private getCombinedLogs(): LogEntry[] {
    const persistedLogs = (this.data!.logs || []) as LogEntry[]
    return persistedLogs.concat(this.pendingLogs)
  }

  flushPendingWrites(): void {
    this.flushLogsSync()
    this.requestLogManager?.flushSync()
  }

  private flushLogsSync(): void {
    if (!this._isInitialized || !this.data || this.pendingLogs.length === 0) {
      return
    }

    const logs = (this.data.logs || []).concat(this.pendingLogs)
    const config = this.getConfig()
    const maxLogs = config.logRetentionDays * 1000

    const trimmedLogs = logs.length > maxLogs ? logs.slice(-maxLogs) : logs

    this.data.logs = trimmedLogs
    this.saveData()
    this.pendingLogs = []
  }

  /**
   * Encrypt Sensitive Data (no-op for file store, could add encryption later)
   */
  encryptData(data: string): string {
    // For Docker deployment, we store data as-is
    // Could add encryption here if needed
    return data
  }

  /**
   * Decrypt Sensitive Data (no-op for file store)
   */
  decryptData(encryptedData: string): string {
    return encryptedData
  }

  /**
   * Encrypt Credentials Object
   */
  encryptCredentials(credentials: Record<string, string>): Record<string, string> {
    const encrypted: Record<string, string> = {}
    
    for (const [key, value] of Object.entries(credentials)) {
      encrypted[key] = this.encryptData(value)
    }
    
    return encrypted
  }

  /**
   * Decrypt Credentials Object
   */
  decryptCredentials(encryptedCredentials: Record<string, string>): Record<string, string> {
    const decrypted: Record<string, string> = {}
    
    for (const [key, value] of Object.entries(encryptedCredentials)) {
      decrypted[key] = this.decryptData(value)
    }
    
    return decrypted
  }

  // ==================== Provider Operations ====================

  getProviders(): Provider[] {
    this.ensureInitialized()
    return this.data!.providers || []
  }

  getProviderById(id: string): Provider | undefined {
    this.ensureInitialized()
    const providers = this.data!.providers || []
    return providers.find((p: Provider) => p.id === id)
  }

  addProvider(provider: Provider): void {
    this.ensureInitialized()
    const providers = this.data!.providers || []
    providers.push(provider)
    this.data!.providers = providers
    this.saveData()
  }

  updateProvider(id: string, updates: Partial<Provider>): Provider | null {
    this.ensureInitialized()
    const providers = this.data!.providers || []
    const index = providers.findIndex((p: Provider) => p.id === id)
    
    if (index === -1) {
      return null
    }
    
    providers[index] = {
      ...providers[index],
      ...updates,
      updatedAt: Date.now(),
    }
    
    this.data!.providers = providers
    this.saveData()
    return providers[index]
  }

  deleteProvider(id: string): boolean {
    this.ensureInitialized()
    const providers = this.data!.providers || []
    const index = providers.findIndex((p: Provider) => p.id === id)
    
    if (index === -1) {
      return false
    }
    
    providers.splice(index, 1)
    this.data!.providers = providers
    this.saveData()
    return true
  }

  // ==================== Account Operations ====================

  getAccounts(includeCredentials: boolean = false): Account[] {
    this.ensureInitialized()
    const accounts = this.data!.accounts || []
    if (includeCredentials) {
      return accounts.map((a: Account) => ({
        ...a,
        credentials: this.decryptCredentials(a.credentials),
      }))
    }
    return accounts
  }

  getActiveAccounts(includeCredentials: boolean = false): Account[] {
    this.ensureInitialized()
    const accounts = this.data!.accounts || []
    const active = accounts.filter((a: Account) => a.status === 'active')
    if (includeCredentials) {
      return active.map((a: Account) => ({
        ...a,
        credentials: this.decryptCredentials(a.credentials),
      }))
    }
    return active
  }

  generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  }

  getAccountById(id: string, includeCredentials: boolean = false): Account | undefined {
    this.ensureInitialized()
    const accounts = this.data!.accounts || []
    const account = accounts.find((a: Account) => a.id === id)
    if (account && includeCredentials) {
      return { ...account, credentials: this.decryptCredentials(account.credentials) }
    }
    return account
  }

  getAccountsByProviderId(providerId: string, includeCredentials: boolean = false): Account[] {
    this.ensureInitialized()
    const accounts = this.data!.accounts || []
    const filtered = accounts.filter((a: Account) => a.providerId === providerId)
    if (includeCredentials) {
      return filtered.map((a: Account) => ({
        ...a,
        credentials: this.decryptCredentials(a.credentials),
      }))
    }
    return filtered
  }

  addAccount(account: Account): void {
    this.ensureInitialized()
    const accounts = this.data!.accounts || []
    accounts.push(account)
    this.data!.accounts = accounts
    this.saveData()
  }

  updateAccount(id: string, updates: Partial<Account>): Account | null {
    this.ensureInitialized()
    const accounts = this.data!.accounts || []
    const index = accounts.findIndex((a: Account) => a.id === id)
    
    if (index === -1) {
      return null
    }
    
    accounts[index] = {
      ...accounts[index],
      ...updates,
      updatedAt: Date.now(),
    }
    
    this.data!.accounts = accounts
    this.saveData()
    return accounts[index]
  }

  deleteAccount(id: string): boolean {
    this.ensureInitialized()
    const accounts = this.data!.accounts || []
    const index = accounts.findIndex((a: Account) => a.id === id)
    
    if (index === -1) {
      return false
    }
    
    accounts.splice(index, 1)
    this.data!.accounts = accounts
    this.saveData()
    return true
  }

  // ==================== Config Operations ====================

  getConfig(): AppConfig {
    this.ensureInitialized()
    return this.normalizeConfig(this.data!.config || DEFAULT_CONFIG)
  }

  updateConfig(updates: Partial<AppConfig>): void {
    this.ensureInitialized()
    this.data!.config = this.normalizeConfig({
      ...this.data!.config,
      ...updates,
    })
    this.saveData()
  }

  // ==================== Log Operations ====================

  getLogs(limit?: number, level?: LogLevel): LogEntry[] {
    this.ensureInitialized()
    let logs = this.getCombinedLogs()
    if (level) {
      logs = logs.filter((l: LogEntry) => l.level === level)
    }
    if (limit && limit > 0) {
      logs = logs.slice(-limit)
    }
    return logs
  }

  getLogStats(): { total: number; info: number; warn: number; error: number; debug: number } {
    this.ensureInitialized()
    const logs = this.getCombinedLogs()
    return {
      total: logs.length,
      info: logs.filter((l: LogEntry) => l.level === 'info').length,
      warn: logs.filter((l: LogEntry) => l.level === 'warn').length,
      error: logs.filter((l: LogEntry) => l.level === 'error').length,
      debug: logs.filter((l: LogEntry) => l.level === 'debug').length,
    }
  }

  getLogTrend(days: number = 7): { date: string; total: number; info: number; warn: number; error: number }[] {
    this.ensureInitialized()
    const logs = this.getCombinedLogs()
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    const trends: { date: string; total: number; info: number; warn: number; error: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = now - (i + 1) * dayMs
      const dayEnd = now - i * dayMs
      const date = new Date(dayStart).toISOString().split('T')[0]
      const dayLogs = logs.filter((l: LogEntry) => l.timestamp >= dayStart && l.timestamp < dayEnd)
      trends.push({
        date,
        total: dayLogs.length,
        info: dayLogs.filter((l: LogEntry) => l.level === 'info').length,
        warn: dayLogs.filter((l: LogEntry) => l.level === 'warn').length,
        error: dayLogs.filter((l: LogEntry) => l.level === 'error').length,
      })
    }
    return trends
  }

  getAccountLogTrend(accountId: string, days: number = 7): { date: string; total: number; info: number; warn: number; error: number }[] {
    this.ensureInitialized()
    const logs = this.getCombinedLogs()
    const accountLogs = logs.filter((l: LogEntry) => (l as any).accountId === accountId && (l as any).requestId)
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    const trends: { date: string; total: number; info: number; warn: number; error: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = now - (i + 1) * dayMs
      const dayEnd = now - i * dayMs
      const date = new Date(dayStart).toISOString().split('T')[0]
      const dayLogs = accountLogs.filter((l: LogEntry) => l.timestamp >= dayStart && l.timestamp < dayEnd)
      const infoCount = dayLogs.filter((l: LogEntry) => l.level === 'info').length
      const warnCount = dayLogs.filter((l: LogEntry) => l.level === 'warn').length
      const errorCount = dayLogs.filter((l: LogEntry) => l.level === 'error').length
      trends.push({ date, total: infoCount, info: infoCount, warn: warnCount, error: errorCount })
    }
    return trends
  }

  exportLogs(format: 'json' | 'txt' = 'json'): string {
    this.ensureInitialized()
    const logs = this.getCombinedLogs()
    if (format === 'json') return JSON.stringify(logs, null, 2)
    return logs.map((log: LogEntry) => {
      const time = new Date(log.timestamp).toISOString()
      const level = log.level.toUpperCase().padEnd(5)
      return `[${time}] [${level}] ${log.message}`
    }).join('\n')
  }

  getLogById(id: string): LogEntry | undefined {
    this.ensureInitialized()
    return this.getCombinedLogs().find((l: LogEntry) => l.id === id)
  }

  addLog(level: LogLevel, message: string, data?: any): void {
    if (!this.shouldRecordLog(level)) {
      return
    }

    const logEntry: LogEntry = {
      id: Date.now().toString(),
      level,
      message,
      timestamp: Date.now(),
      data,
    }

    this.pendingLogs.push(logEntry)
    this.scheduleLogFlush()
  }

  clearLogs(): void {
    this.ensureInitialized()
    this.data!.logs = []
    this.pendingLogs = []
    this.saveData()
  }

  // ==================== Request Log Operations ====================

  private getRequestLogManagerOrThrow(): RequestLogManager {
    if (!this.requestLogManager) throw new Error('RequestLogManager not initialized')
    return this.requestLogManager
  }

  getRequestLogs(limit?: number, filter?: { status?: 'success' | 'error'; providerId?: string }): RequestLogEntry[] {
    this.ensureInitialized()
    return this.getRequestLogManagerOrThrow().getRequestLogs(limit, filter)
  }

  getRequestLogById(id: string): RequestLogEntry | undefined {
    this.ensureInitialized()
    return this.getRequestLogManagerOrThrow().getRequestLogById(id)
  }

  clearRequestLogs(): void {
    this.ensureInitialized()
    this.getRequestLogManagerOrThrow().clearRequestLogs()
  }

  getRequestLogStats(): { total: number; success: number; error: number; todayTotal: number; todaySuccess: number; todayError: number } {
    this.ensureInitialized()
    return this.getRequestLogManagerOrThrow().getRequestLogStats()
  }

  getRequestLogTrend(days: number = 7): { date: string; total: number; success: number; error: number; avgLatency: number }[] {
    this.ensureInitialized()
    return this.getRequestLogManagerOrThrow().getRequestLogTrend(days)
  }

  // ==================== System Prompt Operations ====================

  getSystemPrompts(): SystemPrompt[] {
    this.ensureInitialized()
    const customPrompts = this.data!.systemPrompts || []
    return [...BUILTIN_PROMPTS, ...customPrompts]
  }

  getBuiltinPrompts(): SystemPrompt[] {
    return BUILTIN_PROMPTS
  }

  getCustomPrompts(): SystemPrompt[] {
    this.ensureInitialized()
    return this.data!.systemPrompts || []
  }

  getSystemPromptById(id: string): SystemPrompt | undefined {
    return this.getSystemPrompts().find(p => p.id === id)
  }

  getSystemPromptsByType(type: SystemPrompt['type']): SystemPrompt[] {
    return this.getSystemPrompts().filter(p => p.type === type)
  }

  addSystemPrompt(prompt: Omit<SystemPrompt, 'id' | 'createdAt' | 'updatedAt'>): SystemPrompt {
    this.ensureInitialized()
    const prompts = this.data!.systemPrompts || []
    const newPrompt: SystemPrompt = {
      ...prompt,
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      isBuiltin: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as SystemPrompt
    prompts.push(newPrompt)
    this.data!.systemPrompts = prompts
    this.saveData()
    return newPrompt
  }

  updateSystemPrompt(id: string, updates: Partial<SystemPrompt>): SystemPrompt | null {
    this.ensureInitialized()
    if (BUILTIN_PROMPTS.some(p => p.id === id)) return null
    const prompts = this.data!.systemPrompts || []
    const index = prompts.findIndex((p: SystemPrompt) => p.id === id)
    if (index === -1) return null
    prompts[index] = { ...prompts[index], ...updates, updatedAt: Date.now() }
    this.data!.systemPrompts = prompts
    this.saveData()
    return prompts[index]
  }

  deleteSystemPrompt(id: string): boolean {
    this.ensureInitialized()
    if (BUILTIN_PROMPTS.some(p => p.id === id)) return false
    const prompts = this.data!.systemPrompts || []
    const index = prompts.findIndex((p: SystemPrompt) => p.id === id)
    if (index === -1) return false
    prompts.splice(index, 1)
    this.data!.systemPrompts = prompts
    this.saveData()
    return true
  }

  // ==================== Session Operations ====================

  getSessions(): SessionRecord[] {
    this.ensureInitialized()
    return this.data!.sessions || []
  }

  /**
   * Clean expired sessions
   * Called periodically by SessionManager
   */
  cleanExpiredSessions(): number {
    this.ensureInitialized()
    const sessions = this.data!.sessions || []
    const config = this.getConfig()
    const timeoutMs = config.sessionConfig?.sessionTimeout * 60 * 1000 || 30 * 60 * 1000
    const now = Date.now()

    let removedCount = 0

    // Always delete sessions that are already expired
    let remainingSessions = sessions.filter((s: SessionRecord) => {
      if (s.status === 'expired') {
        removedCount++
        return false
      }
      return true
    })

    // For timed-out active/idle sessions
    const timedOutSessions = remainingSessions.filter((s: SessionRecord) => {
      if (s.status === 'active' || s.status === 'idle') {
        return now - s.updatedAt > timeoutMs
      }
      return false
    })

    if (timedOutSessions.length > 0) {
      // Check deleteAfterTimeout config
      const deleteAfterTimeout = config.sessionConfig?.deleteAfterTimeout ?? false
      if (deleteAfterTimeout) {
        // Delete timed out sessions
        remainingSessions = remainingSessions.filter((s: SessionRecord) => {
          if (s.status === 'active' || s.status === 'idle') {
            return now - s.updatedAt <= timeoutMs
          }
          return true
        })
        removedCount += timedOutSessions.length
      } else {
        // Mark as expired instead of deleting
        remainingSessions = remainingSessions.map((s: SessionRecord) => {
          if (s.status === 'active' || s.status === 'idle') {
            if (now - s.updatedAt > timeoutMs) {
              return { ...s, status: 'expired' as const, updatedAt: now }
            }
          }
          return s
        })
      }
    }

    if (removedCount > 0) {
      this.data!.sessions = remainingSessions
      this.saveData()
      console.log('[FileStore] Cleaned expired sessions:', removedCount)
    }

    return removedCount
  }

  getSessionConfig(): SessionConfig {
    this.ensureInitialized()
    const config = this.getConfig()
    return config.sessionConfig || DEFAULT_SESSION_CONFIG
  }

  updateSessionConfig(updates: Partial<SessionConfig>): SessionConfig {
    this.ensureInitialized()
    const currentConfig = this.getConfig()
    const newSessionConfig = {
      ...(currentConfig.sessionConfig || DEFAULT_SESSION_CONFIG),
      ...updates,
    }
    this.updateConfig({ sessionConfig: newSessionConfig })
    return newSessionConfig
  }

  getSessionsByProviderId(providerId: string): SessionRecord[] {
    this.ensureInitialized()
    const sessions = this.data!.sessions || []
    return sessions.filter((s: SessionRecord) => s.providerId === providerId)
  }

  getSessionsByAccountId(accountId: string): SessionRecord[] {
    this.ensureInitialized()
    const sessions = this.data!.sessions || []
    return sessions.filter((s: SessionRecord) => s.accountId === accountId)
  }

  getActiveSessions(): SessionRecord[] {
    this.ensureInitialized()
    const sessions = this.data!.sessions || []
    const config = this.getSessionConfig()
    const timeoutMs = config.sessionTimeout * 60 * 1000
    const now = Date.now()

    return sessions.filter((s: SessionRecord) =>
      s.status === 'active' &&
      (now - s.lastActiveAt) < timeoutMs
    )
  }

  addMessageToSession(sessionId: string, message: ChatMessage): SessionRecord | null {
    this.ensureInitialized()
    const sessions = this.data!.sessions || []
    const index = sessions.findIndex((s: SessionRecord) => s.id === sessionId)

    if (index === -1) {
      return null
    }

    const session = sessions[index]
    session.messages = [...session.messages, message]
    session.lastActiveAt = Date.now()
    session.updatedAt = Date.now()

    sessions[index] = session
    this.data!.sessions = sessions
    this.saveData()
    return session
  }

  clearAllSessions(): void {
    this.ensureInitialized()
    this.data!.sessions = []
    this.saveData()
  }

  getSessionById(id: string): SessionRecord | undefined {
    this.ensureInitialized()
    const sessions = this.data!.sessions || []
    return sessions.find((s: SessionRecord) => s.id === id)
  }

  addSession(session: SessionRecord): void {
    this.ensureInitialized()
    const sessions = this.data!.sessions || []
    sessions.push(session)
    this.data!.sessions = sessions
    this.saveData()
  }

  updateSession(id: string, updates: Partial<SessionRecord>): SessionRecord | null {
    this.ensureInitialized()
    const sessions = this.data!.sessions || []
    const index = sessions.findIndex((s: SessionRecord) => s.id === id)
    
    if (index === -1) {
      return null
    }
    
    sessions[index] = {
      ...sessions[index],
      ...updates,
      updatedAt: Date.now(),
    }
    
    this.data!.sessions = sessions
    this.saveData()
    return sessions[index]
  }

  deleteSession(id: string): boolean {
    this.ensureInitialized()
    const sessions = this.data!.sessions || []
    const index = sessions.findIndex((s: SessionRecord) => s.id === id)
    
    if (index === -1) {
      return false
    }
    
    sessions.splice(index, 1)
    this.data!.sessions = sessions
    this.saveData()
    return true
  }

  // ==================== Statistics Operations ====================

  getStatistics(): PersistentStatistics {
    this.ensureInitialized()
    return this.data!.statistics || DEFAULT_STATISTICS
  }

  getTodayStatistics(): DailyStatistics {
    this.ensureInitialized()
    const stats = this.data!.statistics || DEFAULT_STATISTICS
    const today = new Date().toISOString().split('T')[0]
    return stats.dailyStats?.[today] || {
      date: today,
      totalRequests: 0,
      successRequests: 0,
      failedRequests: 0,
      totalLatency: 0,
      modelUsage: {},
      providerUsage: {},
    }
  }

  updateStatistics(updates: Partial<PersistentStatistics>): void {
    this.ensureInitialized()
    this.data!.statistics = {
      ...this.data!.statistics,
      ...updates,
    }
    this.saveData()
  }

  // ==================== User Model Overrides Operations ====================

  getUserModelOverrides(): UserModelOverrides {
    this.ensureInitialized()
    return this.data!.userModelOverrides || DEFAULT_USER_MODEL_OVERRIDES
  }

  updateUserModelOverrides(updates: Partial<UserModelOverrides>): void {
    this.ensureInitialized()
    this.data!.userModelOverrides = {
      ...this.data!.userModelOverrides,
      ...updates,
    } as UserModelOverrides
    this.saveData()
  }

  // ==================== Effective Models Operations ====================

  private getProviderModelOverrides(providerId: string): ProviderModelOverrides {
    const overrides = this.getUserModelOverrides()
    return overrides[providerId] || { addedModels: [], excludedModels: [] }
  }

  getEffectiveModels(providerId: string): EffectiveModel[] {
    this.ensureInitialized()
    const provider = this.getProviderById(providerId)
    if (!provider) return []
    const defaultModels = provider.supportedModels || []
    const modelMappings = provider.modelMappings || {}
    const overrides = this.getProviderModelOverrides(providerId)
    const effectiveModels: EffectiveModel[] = []
    defaultModels.forEach(displayName => {
      if (!overrides.excludedModels.includes(displayName)) {
        effectiveModels.push({
          displayName,
          actualModelId: modelMappings[displayName] || displayName,
          isCustom: false,
        })
      }
    })
    overrides.addedModels.forEach(customModel => {
      effectiveModels.push({ ...customModel, isCustom: true })
    })
    return effectiveModels
  }

  addCustomModel(providerId: string, model: CustomModel): EffectiveModel[] {
    this.ensureInitialized()
    const overrides = this.getUserModelOverrides()
    if (!overrides[providerId]) overrides[providerId] = { addedModels: [], excludedModels: [] }
    const exists = overrides[providerId].addedModels.find(
      m => m.displayName === model.displayName || m.actualModelId === model.actualModelId
    )
    if (exists) throw new Error(`Model "${model.displayName}" already exists`)
    overrides[providerId].addedModels.push(model)
    this.updateUserModelOverrides(overrides)
    return this.getEffectiveModels(providerId)
  }

  removeModel(providerId: string, modelName: string): EffectiveModel[] {
    this.ensureInitialized()
    const provider = this.getProviderById(providerId)
    if (!provider) throw new Error('Provider not found')
    const overrides = this.getUserModelOverrides()
    if (!overrides[providerId]) overrides[providerId] = { addedModels: [], excludedModels: [] }
    const defaultModels = provider.supportedModels || []
    if (defaultModels.includes(modelName)) {
      if (!overrides[providerId].excludedModels.includes(modelName)) {
        overrides[providerId].excludedModels.push(modelName)
      }
    } else {
      overrides[providerId].addedModels = overrides[providerId].addedModels.filter(
        m => m.displayName !== modelName
      )
    }
    this.updateUserModelOverrides(overrides)
    return this.getEffectiveModels(providerId)
  }

  resetModels(providerId: string): EffectiveModel[] {
    this.ensureInitialized()
    const overrides = this.getUserModelOverrides()
    if (overrides[providerId]) {
      delete overrides[providerId]
      this.updateUserModelOverrides(overrides)
    }
    return this.getEffectiveModels(providerId)
  }

  // ==================== Store Operations ====================

  getStore(): any {
    this.ensureInitialized()
    return {
      get: (key: string) => this.data![key as keyof StoreSchema],
      set: (key: string, value: any) => {
        this.data![key as keyof StoreSchema] = value
        this.saveData()
      },
      delete: (key: string) => {
        delete this.data![key as keyof StoreSchema]
        this.saveData()
      },
      clear: () => {
        this.data = this.getDefaultData()
        this.saveData()
      },
    }
  }

  clearAll(): void {
    this.ensureInitialized()
    this.data = this.getDefaultData()
    this.saveData()
  }

  getRequestLogManager(): RequestLogManager | null {
    return this.requestLogManager
  }
}

// Export the global singleton instance
export const fileStoreManager = getGlobalFileStoreManager()
export default fileStoreManager
