/**
 * Web Controller Module - Web Interface Control
 * Provides web-based control interface for Chat2API desktop application
 */

import { proxyServer } from './server'
import { proxyStatusManager } from './status'
import { storeManager } from '../store/store'
import { restartApp, getAppVersion, getMainWindow } from '../index'
import { BrowserWindow } from 'electron'

export interface ControlAction {
  action: string
  params?: Record<string, any>
}

export interface SystemStatus {
  app: {
    version: string
    isRunning: boolean
    mainWindowVisible: boolean
  }
  proxy: {
    isRunning: boolean
    port: number
    uptime: number
  }
  statistics: {
    totalRequests: number
    successRequests: number
    failedRequests: number
    activeConnections: number
  }
}

/**
 * Web Controller Class
 */
export class WebController {
  /**
   * Handle control actions from web interface
   */
  async handleAction(action: string, params: Record<string, any> = {}): Promise<any> {
    try {
      switch (action) {
        // Proxy Control
        case 'proxy.start':
          return await this.startProxy(params.port)
        
        case 'proxy.stop':
          return await this.stopProxy()
        
        case 'proxy.restart':
          return await this.restartProxy(params.port)
        
        case 'proxy.getStatus':
          return this.getProxyStatus()
        
        // Configuration Management
        case 'config.get':
          return this.getConfig(params.section)
        
        case 'config.update':
          return await this.updateConfig(params.config)
        
        // Provider Management (limited)
        case 'providers.list':
          return this.listProviders()
        
        case 'providers.getStatus':
          return this.getProvidersStatus()
        
        // System Control
        case 'system.getStatus':
          return this.getSystemStatus()
        
        case 'system.restart':
          return this.restartApp()
        
        case 'system.showWindow':
          return this.showMainWindow()
        
        case 'system.hideWindow':
          return this.hideMainWindow()
        
        // Logs and Statistics
        case 'logs.get':
          return this.getLogs(params.level, params.limit)
        
        case 'statistics.get':
          return this.getStatistics()
        
        case 'statistics.reset':
          return this.resetStatistics()
        
        default:
          throw new Error(`Unknown action: ${action}`)
      }
    } catch (error) {
      throw new Error(`Action '${action}' failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Start proxy server
   */
  private async startProxy(port?: number): Promise<{ success: boolean; port: number }> {
    const success = await proxyServer.start(port)
    return {
      success,
      port: proxyServer.getPort()
    }
  }

  /**
   * Stop proxy server
   */
  private async stopProxy(): Promise<{ success: boolean }> {
    const success = await proxyServer.stop()
    return { success }
  }

  /**
   * Restart proxy server
   */
  private async restartProxy(port?: number): Promise<{ success: boolean; port: number }> {
    const success = await proxyServer.restart(port)
    return {
      success,
      port: proxyServer.getPort()
    }
  }

  /**
   * Get proxy status
   */
  private getProxyStatus() {
    return {
      isRunning: proxyServer.isRunning(),
      port: proxyServer.getPort(),
      status: proxyServer.getStatus(),
      statistics: proxyServer.getStatistics()
    }
  }

  /**
   * Get configuration
   */
  private getConfig(section?: string) {
    const config = storeManager.getConfig()
    return section ? config[section as keyof typeof config] : config
  }

  /**
   * Update configuration
   */
  private async updateConfig(config: Record<string, any>): Promise<{ success: boolean }> {
    storeManager.updateConfig(config)
    return { success: true }
  }

  /**
   * List providers (read-only)
   */
  private listProviders() {
    const config = storeManager.getConfig()
    return config.providers || []
  }

  /**
   * Get providers status
   */
  private getProvidersStatus() {
    const config = storeManager.getConfig()
    const providers = config.providers || []
    
    return providers.map((provider: any) => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      enabled: provider.enabled,
      status: provider.enabled ? 'active' : 'inactive',
      lastUsed: provider.lastUsed
    }))
  }

  /**
   * Get system status
   */
  private getSystemStatus(): SystemStatus {
    const mainWindow = getMainWindow()
    
    return {
      app: {
        version: getAppVersion(),
        isRunning: true,
        mainWindowVisible: mainWindow ? mainWindow.isVisible() : false
      },
      proxy: {
        isRunning: proxyServer.isRunning(),
        port: proxyServer.getPort(),
        uptime: proxyStatusManager.getRunningStatus().uptime
      },
      statistics: proxyServer.getStatistics()
    }
  }

  /**
   * Restart application
   */
  private restartApp(): Promise<{ success: boolean }> {
    // Delay restart to allow response to be sent
    setTimeout(() => {
      restartApp()
    }, 1000)
    
    return Promise.resolve({ success: true })
  }

  /**
   * Show main window
   */
  private showMainWindow(): { success: boolean } {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
      return { success: true }
    }
    return { success: false }
  }

  /**
   * Hide main window
   */
  private hideMainWindow(): { success: boolean } {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.hide()
      return { success: true }
    }
    return { success: false }
  }

  /**
   * Get logs
   */
  private getLogs(level?: string, limit: number = 100) {
    const logs = storeManager.getLogs()
    let filteredLogs = logs
    
    if (level) {
      filteredLogs = logs.filter((log: any) => log.level === level)
    }
    
    return filteredLogs.slice(-limit)
  }

  /**
   * Get statistics
   */
  private getStatistics() {
    return proxyServer.getStatistics()
  }

  /**
   * Reset statistics
   */
  private resetStatistics(): { success: boolean } {
    proxyServer.resetStatistics()
    return { success: true }
  }

  /**
   * Validate web control access
   */
  validateAccess(headers: Record<string, string>): boolean {
    const config = storeManager.getConfig()
    
    // If web control is disabled, deny access
    if (config.webControl?.enabled === false) {
      return false
    }
    
    // If web control password is set, validate it
    if (config.webControl?.password) {
      const authHeader = headers.authorization || headers['x-web-password'] || ''
      const expectedAuth = `Bearer ${config.webControl.password}`
      return authHeader === expectedAuth
    }
    
    return true
  }
}

export const webController = new WebController()
export default webController
