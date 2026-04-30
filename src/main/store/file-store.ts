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

/**
 * File-based Store Manager Class
 * Responsible for data persistence using JSON files
 */
class FileStoreManager {
  private data: StoreSchema | null = null
  private isInitialized: boolean = false
  private initializationError: Error | null = null
  private requestLogManager: RequestLogManager | null = null
  private pendingLogs: LogEntry[] = []
  private logFlushTimer: NodeJS.Timeout | null = null
  private readonly logFlushDelayMs = 2000
  private dataDir: string = '/app/data'

  /**
   * Set data directory
   */
  setDataDir(dir: string): void {
    this.dataDir = dir
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
    if (this.isInitialized) {
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
      this.isInitialized = true
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
   */
  private async initializeDefaultProviders(): Promise<void> {
    const providers = this.data?.providers || []
    const builtinIds = BUILTIN_PROVIDERS.map(p => p.id)
    
    const validProviders = providers.filter((p: Provider) => {
      if (p.type === 'builtin') {
        return builtinIds.includes(p.id)
      }
      return true
    })
    
    const userModelOverrides = this.data?.userModelOverrides || {}
    
    const updatedProviders = validProviders.map((p: Provider) => {
      if (p.type === 'builtin') {
        const builtinConfig = BUILTIN_PROVIDERS.find(bp => bp.id === p.id)
        if (builtinConfig) {
          const hasUserOverrides = userModelOverrides[p.id] && 
            ((userModelOverrides[p.id].addedModels && userModelOverrides[p.id].addedModels.length > 0) ||
             (userModelOverrides[p.id].excludedModels && userModelOverrides[p.id].excludedModels.length > 0))
          
          return { 
            ...p, 
            apiEndpoint: builtinConfig.apiEndpoint,
            chatPath: builtinConfig.chatPath,
            supportedModels: hasUserOverrides ? p.supportedModels : builtinConfig.supportedModels,
            modelMappings: hasUserOverrides ? p.modelMappings : builtinConfig.modelMappings,
            headers: builtinConfig.headers,
            description: builtinConfig.description,
          }
        }
      }
      return p
    })
    
    this.data!.providers = updatedProviders
    this.saveData()
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
    if (!this.isInitialized || !this.data) {
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
    if (!this.isInitialized || !this.data || this.pendingLogs.length === 0) {
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

  getAccounts(): Account[] {
    this.ensureInitialized()
    return this.data!.accounts || []
  }

  getAccountById(id: string): Account | undefined {
    this.ensureInitialized()
    const accounts = this.data!.accounts || []
    return accounts.find((a: Account) => a.id === id)
  }

  getAccountsByProviderId(providerId: string): Account[] {
    this.ensureInitialized()
    const accounts = this.data!.accounts || []
    return accounts.filter((a: Account) => a.providerId === providerId)
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

  getLogs(): LogEntry[] {
    this.ensureInitialized()
    return this.getCombinedLogs()
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

  // ==================== System Prompt Operations ====================

  getSystemPrompts(): SystemPrompt[] {
    this.ensureInitialized()
    return this.data!.systemPrompts || []
  }

  addSystemPrompt(prompt: SystemPrompt): void {
    this.ensureInitialized()
    const prompts = this.data!.systemPrompts || []
    prompts.push(prompt)
    this.data!.systemPrompts = prompts
    this.saveData()
  }

  updateSystemPrompt(id: string, updates: Partial<SystemPrompt>): SystemPrompt | null {
    this.ensureInitialized()
    const prompts = this.data!.systemPrompts || []
    const index = prompts.findIndex((p: SystemPrompt) => p.id === id)
    
    if (index === -1) {
      return null
    }
    
    prompts[index] = {
      ...prompts[index],
      ...updates,
      updatedAt: Date.now(),
    }
    
    this.data!.systemPrompts = prompts
    this.saveData()
    return prompts[index]
  }

  deleteSystemPrompt(id: string): boolean {
    this.ensureInitialized()
    const prompts = this.data!.systemPrompts || []
    const index = prompts.findIndex((p: SystemPrompt) => p.id === id)
    
    if (index === -1) {
      return false
    }
    
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

export const fileStoreManager = new FileStoreManager()
export default fileStoreManager
