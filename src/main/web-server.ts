/**
 * Web Server Entry Point
 * Standalone web server for Docker deployment
 * Runs Koa proxy server and serves React frontend
 */

import { join, dirname } from 'path'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import Koa from 'koa'
import serve from 'koa-static'
import { proxyServer } from './proxy/server'
import { storeManager, setStoreDelegate } from './store/store'
import { proxyStatusManager } from './proxy/status'
import { createWebApiRouter } from './web-api-routes'
import { fileStoreManager } from './store/file-store'

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

// Guard to prevent multiple initializations
let isInitializing = false
let isInitialized = false

/**
 * Initialize application
 */
async function initializeApp(): Promise<void> {
  // Prevent multiple simultaneous initializations
  if (isInitialized) {
    console.log('[WebServer] Already initialized, skipping')
    return
  }
  if (isInitializing) {
    console.log('[WebServer] Initialization in progress, waiting...')
    // Wait for existing initialization to complete
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return
  }
  
  isInitializing = true
  console.log('[WebServer] Initializing application...')
  console.log('[WebServer] Data directory:', DATA_DIR)
  console.log('[WebServer] API port:', API_PORT)
  console.log('[WebServer] Web port:', WEB_PORT)

  // Initialize storage
  try {
    // Use file-store for web mode
    fileStoreManager.setDataDir(DATA_DIR)
    await fileStoreManager.initialize()
    console.log('[WebServer] Storage initialized successfully')

    // Inject fileStoreManager as delegate for storeManager
    // This makes all storeManager calls route to fileStoreManager in web mode
    setStoreDelegate(fileStoreManager)
    console.log('[WebServer] Store delegate injected')
  } catch (error) {
    console.error('[WebServer] Failed to initialize storage:', error)
    throw error
  }

  // Apply environment variable overrides
  applyEnvironmentOverrides()

  // Start proxy server
  const proxyStarted = await proxyServer.start(API_PORT, API_HOST)
  if (!proxyStarted) {
    throw new Error('Failed to start proxy server')
  }
  console.log(`[WebServer] Proxy server started on ${API_HOST}:${API_PORT}`)

  // Start web server for frontend
  await startWebServer()

  console.log('[WebServer] Application started successfully')
  isInitialized = true
  isInitializing = false
}

/**
 * Apply environment variable overrides to config
 */
function applyEnvironmentOverrides(): void {
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

  // Read web-api-bridge.js content to inject into HTML
  const bridgePaths = [
    join(__dirname, 'web-api-bridge.js'),           // compiled: out/main/
    join(__dirname, '../../src/main/web-api-bridge.js'), // tsx: src/main/
  ]
  let bridgeScript = ''
  for (const p of bridgePaths) {
    if (existsSync(p)) {
      bridgeScript = readFileSync(p, 'utf-8')
      console.log('[WebServer] Loaded web-api-bridge from:', p)
      break
    }
  }
  if (!bridgeScript) {
    console.warn('[WebServer] web-api-bridge.js not found, window.electronAPI will be unavailable')
  }

  // Serve static files from build directory (but not index.html)
  // When running via tsx (Docker), __dirname is src/main, so built files are at ../../out/renderer
  // When running compiled (from out/main), files are at ../renderer
  const candidatePaths = [
    join(__dirname, '../../out/renderer'),  // tsx: src/main -> out/renderer
    join(__dirname, '../renderer'),          // compiled: out/main -> out/renderer
  ]
  const buildPath = candidatePaths.find(p => existsSync(join(p, 'index.html'))) || candidatePaths[0]
  console.log('[WebServer] Serving frontend from:', buildPath)

  // SPA fallback - serve index.html with bridge injection for all non-API, non-assets paths
  // This MUST come before serve('/assets') so root and SPA routes are handled
  app.use(async (ctx, next) => {
    // Skip API paths - let webApi handle them
    if (ctx.path.startsWith('/manage')) return next()
    // Skip static assets - let serve() handle them
    if (ctx.path.startsWith('/assets')) return next()
    // Skip health/stats/v1/v0 paths
    if (ctx.path.startsWith('/v1') || ctx.path.startsWith('/v0') || ctx.path.startsWith('/health') || ctx.path.startsWith('/stats')) {
      return next()
    }

    // For all other routes (including / and SPA routes like /providers), serve index.html with injected bridge script
    try {
      const { readFile } = await import('fs/promises')
      const indexPath = join(buildPath, 'index.html')
      let content = await readFile(indexPath, 'utf-8')
      // Inject bridge script before </head> so it runs before React mounts
      if (bridgeScript) {
        content = content.replace(
          '</head>',
          `<script>\n${bridgeScript}\n</script>\n</head>`
        )
      }
      ctx.type = 'text/html'
      ctx.body = content
    } catch (error) {
      ctx.status = 404
      ctx.body = 'Frontend not built. Please run "npm run build" first.'
    }
  })

  // Serve static files ONLY for /assets/* (after SPA fallback for root)
  // This ensures /manage/* routes reach the API handler
  app.use(serve(buildPath, { path: '/assets' }))

  // Debug middleware to trace request flow
  app.use(async (ctx, next) => {
    console.log('[Debug] Path:', ctx.path, 'Matched route will be:', ctx._matchedRoute || 'none')
    await next()
    console.log('[Debug] Response:', ctx.status, ctx.path)
  })

  // Mount management REST API (after static files so API takes precedence for /manage/*)
  const webApi = createWebApiRouter()
  // Add initialization guard as the first middleware
  app.use(webApi.initGuard())
  app.use(webApi.bodyParser())
  app.use(webApi.routes())
  app.use(webApi.allowedMethods())

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
