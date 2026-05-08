/**
 * Proxy Service Module - Load Balancer
 * Implements Round Robin and Fill First strategies
 */

import { Account, Provider, LoadBalanceStrategy } from '../store/types'
import { AccountSelection } from './types'
import { fileStoreManager } from '../store/file-store'

/**
 * Load Balancer
 */
export class LoadBalancer {
  private roundRobinIndex: Map<string, number> = new Map()
  private failedAccounts: Map<string, { count: number; lastFailTime: number }> = new Map()
  private static readonly FAIL_THRESHOLD = 3
  private static readonly RECOVERY_TIME = 60000 // 1 minute

  /**
   * Mark account as failed
   */
  markAccountFailed(accountId: string): void {
    const current = this.failedAccounts.get(accountId) || { count: 0, lastFailTime: 0 }
    this.failedAccounts.set(accountId, {
      count: current.count + 1,
      lastFailTime: Date.now(),
    })
  }

  /**
   * Clear account failure status
   */
  clearAccountFailure(accountId: string): void {
    this.failedAccounts.delete(accountId)
  }

  /**
   * Check if account is in failure state
   */
  private isAccountInFailure(accountId: string): boolean {
    const failure = this.failedAccounts.get(accountId)
    if (!failure) return false

    if (Date.now() - failure.lastFailTime > LoadBalancer.RECOVERY_TIME) {
      this.failedAccounts.delete(accountId)
      return false
    }

    return failure.count >= LoadBalancer.FAIL_THRESHOLD
  }

  /**
   * Select account
   * @param model Requested model
   * @param strategy Load balance strategy
   * @param preferredProviderId Preferred provider ID
   * @param preferredAccountId Preferred account ID
   */
  selectAccount(
    model: string,
    strategy: LoadBalanceStrategy = 'round-robin',
    preferredProviderId?: string,
    preferredAccountId?: string
  ): AccountSelection | null {
    const candidates = this.getAvailableAccounts(model, preferredProviderId, strategy === 'failover')

    if (candidates.length === 0) {
      return null
    }

    if (preferredAccountId) {
      const preferred = candidates.find(c => c.account.id === preferredAccountId)
      if (preferred && !this.isAccountInFailure(preferredAccountId)) {
        return preferred
      }
    }

    if (strategy === 'fill-first') {
      return this.selectFillFirst(candidates)
    }

    if (strategy === 'failover') {
      return this.selectFailover(candidates)
    }

    return this.selectRoundRobin(candidates)
  }

  /**
   * Get available accounts list
   */
  private getAvailableAccounts(
    model: string,
    preferredProviderId?: string,
    excludeFailed: boolean = false
  ): AccountSelection[] {
    const providers = fileStoreManager.getProviders().filter(p => p.enabled)
    const candidates: AccountSelection[] = []

    for (const provider of providers) {
      if (preferredProviderId && provider.id !== preferredProviderId) {
        continue
      }

      if (!this.providerSupportsModel(provider, model)) {
        continue
      }

      const accounts = fileStoreManager.getAccountsByProviderId(provider.id, true)
        .filter(account => this.isAccountAvailable(account))
        .filter(account => !excludeFailed || !this.isAccountInFailure(account.id))

      console.log(`[LoadBalancer] Provider ${provider.name} (${provider.id}) has ${accounts.length} available accounts`)

      for (const account of accounts) {
        console.log(`[LoadBalancer] Account ${account.name} (${account.id}) Token: ${(account.credentials.token || '').substring(0, 20)}...`)
        candidates.push({
          account,
          provider,
          actualModel: this.mapModel(model, provider),
        })
      }
    }

    return candidates
  }

  /**
   * Check if provider supports model
   * Supports "provider/model" format (e.g., "custom/deepseek-v4-flash-search")
   */
  private providerSupportsModel(provider: Provider, model: string): boolean {
    // Extract actual model name from "provider/model" format
    let normalizedModel = model
    if (model.includes('/')) {
      const parts = model.split('/')
      normalizedModel = parts[parts.length - 1]  // Use the last part (actual model name)
      console.log(`[LoadBalancer] providerSupportsModel extracted: "${model}" -> "${normalizedModel}"`)
    }
    
    const effectiveModels = fileStoreManager.getEffectiveModels(provider.id)
    if (effectiveModels.length === 0) {
      return true
    }

    const normalizedModelLower = normalizedModel.toLowerCase()
    const supported = effectiveModels.some(m => {
      const normalizedSupported = m.displayName.toLowerCase()
      if (normalizedSupported.endsWith('*')) {
        return normalizedModelLower.startsWith(normalizedSupported.slice(0, -1))
      }
      return normalizedSupported === normalizedModelLower
    })
    
    if (supported) {
      console.log(`[LoadBalancer] Provider ${provider.name} supports model "${normalizedModel}" (from "${model}") via effective models`)
      return true
    }

    const config = fileStoreManager.getConfig()
    
    // Try with normalized model name first
    let globalMapping = config.modelMappings[normalizedModel]
    
    // If not found, try with original model name (might have prefix mapping)
    if (!globalMapping) {
      globalMapping = config.modelMappings[model]
    }
    
    if (globalMapping) {
      if (globalMapping.preferredProviderId) {
        if (globalMapping.preferredProviderId === provider.id) {
          console.log(`[LoadBalancer] Model "${model}" matched preferred provider ${provider.name}`)
          return true
        }
        return false
      }
      
      const actualModel = globalMapping.actualModel
      const normalizedActualModel = actualModel.toLowerCase()
      const actualSupported = effectiveModels.some(m => {
        const normalizedSupported = m.displayName.toLowerCase()
        if (normalizedSupported.endsWith('*')) {
          return normalizedActualModel.startsWith(normalizedSupported.slice(0, -1))
        }
        return normalizedSupported === normalizedActualModel
      })
      
      if (actualSupported) {
        console.log(`[LoadBalancer] Model "${model}" (actualModel: "${actualModel}") supported by ${provider.name}`)
        return true
      }
    }
    
    console.log(`[LoadBalancer] Provider ${provider.name} does not support model ${model}`)
    return false
  }

  /**
   * Check if account is available
   */
  private isAccountAvailable(account: Account): boolean {
    if (account.status !== 'active') {
      return false
    }

    if (account.dailyLimit && account.todayUsed && account.todayUsed >= account.dailyLimit) {
      return false
    }

    return true
  }

  /**
   * Map model name
   * Supports "provider/model" format (e.g., "custom/deepseek-v4-flash-search")
   * where "provider" is ignored and "model" is used for mapping
   */
  private mapModel(model: string, provider: Provider): string {
    console.log(`[LoadBalancer] mapModel called with model="${model}", provider="${provider.name}"`)
    
    // Handle "provider/model" format (e.g., "custom/deepseek-v4-flash-search")
    // Extract the actual model name after the prefix
    let normalizedModel = model
    if (model.includes('/')) {
      const parts = model.split('/')
      normalizedModel = parts[parts.length - 1]  // Use the last part (actual model name)
      console.log(`[LoadBalancer] Extracted model name from prefix format: "${model}" -> "${normalizedModel}"`)
    }
    
    const effectiveModels = fileStoreManager.getEffectiveModels(provider.id)
    const effectiveModel = effectiveModels.find(m => 
      m.displayName.toLowerCase() === normalizedModel.toLowerCase()
    )
    
    if (effectiveModel) {
      console.log(`[LoadBalancer] Model mapped from "${model}" to "${effectiveModel.actualModelId}" via effective models`)
      return effectiveModel.actualModelId
    }

    const config = fileStoreManager.getConfig()
    const mapping = config.modelMappings[normalizedModel]

    if (mapping && (!mapping.preferredProviderId || mapping.preferredProviderId === provider.id)) {
      const actualModel = mapping.actualModel
      console.log(`[LoadBalancer] Model mapped from "${model}" to "${actualModel}" via global mapping`)
      
      const actualEffectiveModel = effectiveModels.find(m => 
        m.displayName.toLowerCase() === actualModel.toLowerCase()
      )
      if (actualEffectiveModel) {
        console.log(`[LoadBalancer] Model further mapped from "${actualModel}" to "${actualEffectiveModel.actualModelId}" via effective models`)
        return actualEffectiveModel.actualModelId
      }
      
      return actualModel
    }

    // If no mapping found for normalized model, try original model
    const originalMapping = config.modelMappings[model]
    if (originalMapping && (!originalMapping.preferredProviderId || originalMapping.preferredProviderId === provider.id)) {
      const actualModel = originalMapping.actualModel
      console.log(`[LoadBalancer] Model mapped from "${model}" to "${actualModel}" via global mapping (original key)`)
      return actualModel
    }

    console.log(`[LoadBalancer] No mapping found, returning original model "${model}"`)
    return model
  }

  /**
   * Round Robin strategy
   */
  private selectRoundRobin(candidates: AccountSelection[]): AccountSelection {
    const providerIds = [...new Set(candidates.map(c => c.provider.id))]
    const key = providerIds.join(',')

    const currentIndex = this.roundRobinIndex.get(key) || 0
    const selected = candidates[currentIndex % candidates.length]

    this.roundRobinIndex.set(key, (currentIndex + 1) % candidates.length)

    return selected
  }

  /**
   * Fill First strategy
   * Use current account preferentially until limit is reached
   */
  private selectFillFirst(candidates: AccountSelection[]): AccountSelection {
    return candidates.reduce((best, current) => {
      const bestUsed = best.account.todayUsed || 0
      const currentUsed = current.account.todayUsed || 0

      if (currentUsed < bestUsed) {
        return current
      }

      if (currentUsed === bestUsed) {
        const bestLastUsed = best.account.lastUsed || 0
        const currentLastUsed = current.account.lastUsed || 0

        if (currentLastUsed < bestLastUsed) {
          return current
        }
      }

      return best
    })
  }

  /**
   * Failover strategy
   * Select account with least failures, preferring healthy accounts
   */
  private selectFailover(candidates: AccountSelection[]): AccountSelection {
    const healthyCandidates = candidates.filter(c => !this.isAccountInFailure(c.account.id))
    
    if (healthyCandidates.length > 0) {
      return this.selectRoundRobin(healthyCandidates)
    }

    const sortedCandidates = candidates.sort((a, b) => {
      const failureA = this.failedAccounts.get(a.account.id)
      const failureB = this.failedAccounts.get(b.account.id)

      const countA = failureA ? failureA.count : 0
      const countB = failureB ? failureB.count : 0

      if (countA !== countB) {
        return countA - countB
      }

      const timeA = failureA ? failureA.lastFailTime : 0
      const timeB = failureB ? failureB.lastFailTime : 0

      return timeA - timeB
    })

    return sortedCandidates[0]
  }

  /**
   * Reset Round Robin index
   */
  resetRoundRobinIndex(): void {
    this.roundRobinIndex.clear()
  }

  /**
   * Get available account count
   */
  getAvailableAccountCount(model: string, providerId?: string): number {
    return this.getAvailableAccounts(model, providerId).length
  }

  /**
   * Get all available models
   */
  getAvailableModels(): string[] {
    const providers = fileStoreManager.getProviders().filter(p => p.enabled)
    const models = new Set<string>()

    for (const provider of providers) {
      const accounts = fileStoreManager.getAccountsByProviderId(provider.id)
        .filter(account => this.isAccountAvailable(account))

      if (accounts.length > 0) {
        const effectiveModels = fileStoreManager.getEffectiveModels(provider.id)
        effectiveModels.forEach(m => models.add(m.displayName))
      }
    }

    return [...models]
  }
}

export const loadBalancer = new LoadBalancer()
export default loadBalancer
