/**
 * Tool Registry Service
 * Pre-maintains tool definitions for efficient tool call handling
 * 
 * This service allows:
 * 1. Pre-configuring tool definitions locally
 * 2. Fast lookup by tool name during request processing
 * 3. Only extracting key info (tool name) from client requests
 */

import type { ChatCompletionTool } from '../proxy/types'
import type { ToolRegistryConfig as StoreToolRegistryConfig } from '../../store/types'

/**
 * Tool Entry - stores complete tool definition
 */
export interface ToolEntry {
  /** Unique identifier for the tool */
  id: string
  /** Tool name (used for matching) */
  name: string
  /** Provider/Source this tool belongs to */
  provider?: string
  /** Complete tool definition */
  definition: ChatCompletionTool
  /** Whether this tool is enabled */
  enabled: boolean
  /** Tags for grouping tools */
  tags?: string[]
  /** Created time */
  createdAt: number
  /** Updated time */
  updatedAt: number
}

/**
 * Tool Registry Configuration
 */
export interface ToolRegistryConfig {
  /** Whether tool registry is enabled */
  enabled: boolean
  /** Default format for injected prompts */
  defaultFormat: 'bracket' | 'xml'
  /** Whether to merge with client-provided tools */
  mergeWithClientTools: boolean
  /** Priority mode: 'registry' | 'client' | 'merge' */
  priorityMode: 'registry' | 'client' | 'merge'
  /** Whether to auto-register unknown tools from client requests */
  autoRegister: boolean
  /** Default provider for auto-registered tools */
  autoRegisterProvider?: string
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ToolRegistryConfig = {
  enabled: true,
  defaultFormat: 'bracket',
  mergeWithClientTools: true,
  priorityMode: 'merge',
  autoRegister: true,
  autoRegisterProvider: 'auto-registered',
}

/**
 * Tool Registry Service
 */
export class ToolRegistryService {
  private tools: Map<string, ToolEntry> = new Map()
  private config: ToolRegistryConfig = { ...DEFAULT_CONFIG }
  private initialized = false

  /**
   * Initialize the service with stored tools
   */
  async initialize(tools: ToolEntry[], config?: Partial<ToolRegistryConfig>): Promise<void> {
    this.tools.clear()
    
    for (const tool of tools) {
      if (tool.enabled) {
        this.tools.set(tool.name.toLowerCase(), tool)
      }
    }
    
    if (config) {
      this.config = { ...DEFAULT_CONFIG, ...config }
    }
    
    this.initialized = true
    console.log(`[ToolRegistry] Initialized with ${this.tools.size} tools`)
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ToolRegistryConfig>): void {
    this.config = { ...this.config, ...config }
    console.log(`[ToolRegistry] Config updated:`, this.config)
  }

  /**
   * Get current configuration
   */
  getConfig(): ToolRegistryConfig {
    return { ...this.config }
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Add or update a tool
   */
  setTool(entry: ToolEntry): void {
    entry.updatedAt = Date.now()
    if (!entry.createdAt) {
      entry.createdAt = entry.updatedAt
    }
    if (!entry.id) {
      entry.id = `${entry.name}_${entry.createdAt}`
    }
    
    // Ensure name is lowercase for consistent lookup
    const normalizedName = entry.name.toLowerCase()
    entry.name = entry.name  // Keep original case in definition
    
    this.tools.set(normalizedName, entry)
    console.log(`[ToolRegistry] Tool registered: ${entry.name}`)
  }

  /**
   * Remove a tool by name
   */
  removeTool(name: string): boolean {
    const normalizedName = name.toLowerCase()
    const deleted = this.tools.delete(normalizedName)
    if (deleted) {
      console.log(`[ToolRegistry] Tool removed: ${name}`)
    }
    return deleted
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): ToolEntry | undefined {
    const normalizedName = name.toLowerCase()
    return this.tools.get(normalizedName)
  }

  /**
   * Get all enabled tools
   */
  getAllTools(): ToolEntry[] {
    return Array.from(this.tools.values()).filter(t => t.enabled)
  }

  /**
   * Get all tool definitions (ChatCompletionTool format)
   */
  getToolDefinitions(): ChatCompletionTool[] {
    return this.getAllTools().map(t => t.definition)
  }

  /**
   * Match client-provided tool names with registry
   * Returns only the tools that are found in registry
   */
  matchTools(clientToolNames: string[]): ToolEntry[] {
    const matched: ToolEntry[] = []
    
    for (const name of clientToolNames) {
      const tool = this.getTool(name)
      if (tool && tool.enabled) {
        matched.push(tool)
      } else {
        console.log(`[ToolRegistry] Tool not found in registry: ${name}`)
      }
    }
    
    return matched
  }

  /**
   * Match client-provided tools with registry
   * Returns complete tool definitions
   */
  matchToolDefinitions(clientTools: ChatCompletionTool[]): ChatCompletionTool[] {
    const clientNames = clientTools.map(t => t.function.name)
    const matched = this.matchTools(clientNames)
    return matched.map(t => t.definition)
  }

  /**
   * Process client tools based on priority mode
   * This is the main method called during request processing
   */
  processClientTools(clientTools?: ChatCompletionTool[]): {
    tools: ChatCompletionTool[]
    merged: boolean
    source: 'registry' | 'client' | 'merged'
    newlyRegistered?: ToolEntry[]
  } {
    // If registry disabled, return client tools as-is
    if (!this.config.enabled) {
      return {
        tools: clientTools || [],
        merged: false,
        source: 'client'
      }
    }

    // If no client tools, use registry only
    if (!clientTools || clientTools.length === 0) {
      const registryTools = this.getToolDefinitions()
      return {
        tools: registryTools,
        merged: false,
        source: registryTools.length > 0 ? 'registry' : 'client'
      }
    }

    // Apply priority mode
    switch (this.config.priorityMode) {
      case 'registry':
        return {
          tools: this.getToolDefinitions(),
          merged: false,
          source: 'registry'
        }
      
      case 'client':
        // Auto-register new tools if enabled
        const registeredInClientMode = this.autoRegisterTools(clientTools)
        return {
          tools: clientTools,
          merged: false,
          source: 'client',
          newlyRegistered: registeredInClientMode
        }
      
      case 'merge':
      default:
        // Only inject tools that are in the current request (clientTools)
        const resultTools: ChatCompletionTool[] = []
        const newlyRegisteredList: ToolEntry[] = []

        if (clientTools && clientTools.length > 0) {
          // Step 1: Build resultTools using registry definitions if available
          for (const clientTool of clientTools) {
            const toolName = clientTool.function.name.toLowerCase()
            const registryEntry = this.tools.get(toolName)
            if (registryEntry) {
              resultTools.push(registryEntry.definition)
            } else {
              resultTools.push(clientTool)
            }
          }

          // Step 2: Auto-register tools not yet in registry (batch)
          if (this.config.autoRegister) {
            const newTools = clientTools.filter(
              t => !this.tools.has(t.function.name.toLowerCase())
            )
            if (newTools.length > 0) {
              const registered = this.autoRegisterTools(newTools)
              if (registered.length > 0) {
                newlyRegisteredList.push(...registered)
              }
            }
          }
        }

        return {
          tools: resultTools,
          merged: resultTools.length > 0,
          source: 'merged',
          newlyRegistered: newlyRegisteredList.length > 0 ? newlyRegisteredList : undefined
        }
    }
  }

  /**
   * Auto-register tools from client requests
   * Returns list of newly registered tools
   */
  private autoRegisterTools(tools: ChatCompletionTool[]): ToolEntry[] {
    if (!this.config.autoRegister || !tools || tools.length === 0) {
      return []
    }

    const newlyRegistered: ToolEntry[] = []
    
    for (const tool of tools) {
      const name = tool.function.name
      const normalizedName = name.toLowerCase()
      
      // Skip if already registered
      if (this.tools.has(normalizedName)) {
        continue
      }

      // Create new entry
      const entry: ToolEntry = {
        id: `auto_${name}_${Date.now()}`,
        name: name,
        provider: this.config.autoRegisterProvider || 'auto-registered',
        definition: tool,
        enabled: true,
        tags: ['auto-registered'],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      this.tools.set(normalizedName, entry)
      newlyRegistered.push(entry)
      console.log(`[ToolRegistry] Auto-registered tool: ${name}`)
    }

    if (newlyRegistered.length > 0) {
      console.log(`[ToolRegistry] Auto-registered ${newlyRegistered.length} new tool(s)`)
    }

    return newlyRegistered
  }

  /**
   * Get tool count
   */
  getToolCount(): number {
    return this.tools.size
  }

  /**
   * Export all tools as array
   */
  exportTools(): ToolEntry[] {
    return this.getAllTools()
  }

  /**
   * Bulk import tools
   */
  importTools(entries: ToolEntry[]): { success: number; failed: number; errors: string[] } {
    let success = 0
    let failed = 0
    const errors: string[] = []

    for (const entry of entries) {
      try {
        // Validate required fields
        if (!entry.name) {
          errors.push(`Tool missing name field`)
          failed++
          continue
        }
        if (!entry.definition) {
          errors.push(`Tool ${entry.name} missing definition`)
          failed++
          continue
        }
        if (!entry.definition.function) {
          errors.push(`Tool ${entry.name} missing function field`)
          failed++
          continue
        }
        if (!entry.definition.function.name) {
          errors.push(`Tool ${entry.name} missing function.name field`)
          failed++
          continue
        }

        this.setTool(entry)
        success++
      } catch (err) {
        errors.push(`Tool ${entry.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        failed++
      }
    }

    console.log(`[ToolRegistry] Import result: ${success} success, ${failed} failed`)
    return { success, failed, errors }
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear()
    console.log(`[ToolRegistry] All tools cleared`)
  }
}

/**
 * Singleton instance
 */
export const toolRegistry = new ToolRegistryService()
