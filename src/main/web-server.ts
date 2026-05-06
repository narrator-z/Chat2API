/**
 * Web Server Entry Point
 * Standalone web server for Docker deployment
 * Runs Koa proxy server and serves React frontend
 */

import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import Koa from 'koa'
import serve from 'koa-static'
import { proxyServer } from './proxy/server'
import { storeManager } from './store/store'
import { proxyStatusManager } from './proxy/status'

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Environment variables
const DATA_DIR = process.env.DATA_DIR || '/app/data'
const API_PORT = parseInt(process.env.API_PORT || '8088', 10)
const WEB_PORT = parseInt(process.env.WEB_PORT || '3001', 10)
const API_HOST = process.env.API_HOST || '0.0.0.0'
const WEB_HOST = process.env.WEB_HOST || '0.0.0.0'

// Set web mode for store manager
process.env.WEB_MODE = 'true'

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true })
}

/**
 * Initialize application
 */
async function initializeApp(): Promise<void> {
  console.log('[WebServer] Initializing application...')
  console.log('[WebServer] Data directory:', DATA_DIR)
  console.log('[WebServer] API port:', API_PORT)
  console.log('[WebServer] Web port:', WEB_PORT)

  // Initialize storage
  try {
    // Use file-store for web mode
    const { fileStoreManager } = await import('./store/file-store')
    fileStoreManager.setDataDir(DATA_DIR)
    await fileStoreManager.initialize()
    console.log('[WebServer] Storage initialized successfully')
  } catch (error) {
    console.error('[WebServer] Failed to initialize storage:', error)
    throw error
  }

  // Apply environment variable overrides
  await applyEnvironmentOverrides()

  // Start proxy server
  const proxyStarted = await proxyServer.start(API_PORT, API_HOST)
  if (!proxyStarted) {
    throw new Error('Failed to start proxy server')
  }
  console.log(`[WebServer] Proxy server started on ${API_HOST}:${API_PORT}`)

  // Start web server for frontend
  await startWebServer()

  console.log('[WebServer] Application started successfully')
}

/**
 * Apply environment variable overrides to config
 */
async function applyEnvironmentOverrides(): Promise<void> {
  const { fileStoreManager } = await import('./store/file-store')
  const config = fileStoreManager.getConfig()

  if (process.env.ENABLE_API_KEY === 'true') {
    config.enableApiKey = true
  }

  if (process.env.MANAGEMENT_API_SECRET) {
    if (!config.managementApi) {
      config.managementApi = {
        enableManagementApi: true,
        managementApiSecret: process.env.MANAGEMENT_API_SECRET,
      }
    } else {
      config.managementApi.enableManagementApi = true
      config.managementApi.managementApiSecret = process.env.MANAGEMENT_API_SECRET
    }
  }

  fileStoreManager.updateConfig(config)
  console.log('[WebServer] Environment variable overrides applied')
}

/**
 * Start web server for React frontend
 */
async function startWebServer(): Promise<void> {
  const app = new Koa()
  
  // Serve static files from build directory
  const buildPath = join(__dirname, '../renderer')
  app.use(serve(buildPath))

  // SPA fallback - serve index.html for all non-API routes
  app.use(async (ctx) => {
    if (ctx.path.startsWith('/v1') || ctx.path.startsWith('/v0') || ctx.path.startsWith('/health') || ctx.path.startsWith('/stats')) {
      ctx.status = 404
      ctx.body = { error: 'Not found' }
      return
    }
    
    // For all other routes, serve index.html
    try {
      const { readFile } = await import('fs/promises')
      const indexPath = join(buildPath, 'index.html')
      const content = await readFile(indexPath, 'utf-8')
      ctx.type = 'text/html'
      ctx.body = content
    } catch (error) {
      ctx.status = 404
      ctx.body = 'Frontend not built. Please run "npm run build" first.'
    }
  })

  return new Promise((resolve, reject) => {
    const server = app.listen(WEB_PORT, WEB_HOST, () => {
      console.log(`[WebServer] Web server started on ${WEB_HOST}:${WEB_PORT}`)
      resolve()
    })

    server.on('error', (err: NodeJS.ErrnoException) => {
      console.error('[WebServer] Failed to start web server:', err)
      reject(err)
    })
  })
}

/**
 * Graceful shutdown
 */
async function shutdown(): Promise<void> {
  console.log('[WebServer] Shutting down...')
  
  await proxyServer.stop()
  storeManager.flushPendingWrites()
  
  console.log('[WebServer] Shutdown complete')
  process.exit(0)
}

// Handle shutdown signals
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[WebServer] Uncaught Exception:', error)
  shutdown()
})

process.on('unhandledRejection', (reason) => {
  console.error('[WebServer] Unhandled Rejection:', reason)
})

// Start application
initializeApp().catch((error) => {
  console.error('[WebServer] Failed to start application:', error)
  process.exit(1)
})
