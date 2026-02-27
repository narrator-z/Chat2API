/**
 * Proxy Service Module - Proxy Server Core
 * Implements proxy server based on Koa
 */

import Koa from 'koa'
import Router from '@koa/router'
import bodyParser from 'koa-bodyparser'
import { Server as HttpServer } from 'http'
import { createServer } from 'net'
import routes from './routes'
import { proxyStatusManager } from './status'
import { storeManager } from '../store/store'
import { webController } from './web-controller'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Proxy Server Class
 */
export class ProxyServer {
  private app: Koa
  private router: Router
  private server: HttpServer | null = null
  private port: number = 8080

  constructor() {
    this.app = new Koa()
    this.router = new Router()

    this.setupMiddleware()
    this.setupRoutes()
    this.setupErrorHandler()
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    this.app.use(async (ctx, next) => {
      ctx.set('Access-Control-Allow-Origin', '*')
      ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      ctx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
      ctx.set('Access-Control-Max-Age', '86400')

      if (ctx.method === 'OPTIONS') {
        ctx.status = 204
        return
      }

      await next()
    })

    this.app.use(bodyParser({
      jsonLimit: '50mb',
      formLimit: '50mb',
      textLimit: '50mb',
    }))

    // API Key validation middleware
    this.app.use(async (ctx, next) => {
      // Skip paths that don't require authentication
      const publicPaths = ['/', '/health', '/stats']
      if (publicPaths.includes(ctx.path)) {
        await next()
        return
      }

      const config = storeManager.getConfig()
      
      if (config.enableApiKey && config.apiKeys && config.apiKeys.length > 0) {
        const authHeader = ctx.get('Authorization') || ''
        const providedKey = authHeader.startsWith('Bearer ') 
          ? authHeader.slice(7) 
          : (ctx.query.api_key as string) || ctx.get('X-API-Key')
        
        if (!providedKey) {
          ctx.status = 401
          ctx.body = {
            error: {
              message: 'API key is required',
              type: 'invalid_request_error',
              code: 'missing_api_key',
            },
          }
          return
        }
        
        const validKey = config.apiKeys.find(
          k => k.key === providedKey && k.enabled
        )
        
        if (!validKey) {
          ctx.status = 401
          ctx.body = {
            error: {
              message: 'Invalid API key',
              type: 'invalid_request_error',
              code: 'invalid_api_key',
            },
          }
          return
        }
        
        // Update usage statistics
        const updatedKeys = config.apiKeys.map(k => 
          k.id === validKey.id 
            ? { 
                ...k, 
                lastUsedAt: Date.now(), 
                usageCount: k.usageCount + 1 
              }
            : k
        )
        storeManager.updateConfig({ apiKeys: updatedKeys })
      }
      
      await next()
    })

    this.app.use(async (ctx, next) => {
      const startTime = Date.now()

      await next()

      const latency = Date.now() - startTime
      const logLevel = ctx.status >= 400 ? 'warn' : 'info'

      if (!ctx.path.startsWith('/v1/models')) {
        storeManager.addLog(logLevel, `${ctx.method} ${ctx.path} ${ctx.status} ${latency}ms`, {
          method: ctx.method,
          path: ctx.path,
          status: ctx.status,
          latency,
          clientIP: ctx.ip,
        })
      }
    })
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    for (const route of routes) {
      this.router.use(route.routes())
      this.router.use(route.allowedMethods())
    }

    // Web UI Route
    this.router.get('/', async (ctx) => {
      try {
        const htmlContent = this.getWebUIHTML()
        ctx.type = 'text/html'
        ctx.body = htmlContent
      } catch (error) {
        const currentPort = this.getPort()
        ctx.body = {
          name: 'Chat2API Proxy',
          version: '1.0.0',
          description: 'OpenAI API compatible proxy service',
          port: currentPort,
          endpoints: [
            'POST /v1/chat/completions',
            'GET /v1/models',
            'GET /v1/models/:model',
            'POST /v1/completions',
          ],
          webUI: 'Web UI available at this endpoint',
          note: currentPort === 58080 ? 'Using default port 58080' : `Using port ${currentPort} (default 58080 was occupied)`
        }
      }
    })

    // Web Control API Routes
    this.router.post('/api/control/:action', async (ctx) => {
      try {
        // Validate access
        if (!webController.validateAccess(ctx.headers)) {
          ctx.status = 401
          ctx.body = {
            error: {
              message: 'Unauthorized access to web control',
              type: 'authentication_error',
              code: 'unauthorized'
            }
          }
          return
        }

        const { action } = ctx.params
        const params = ctx.request.body || {}
        
        const result = await webController.handleAction(action as string, params)
        
        ctx.body = {
          success: true,
          data: result,
          timestamp: Date.now()
        }
      } catch (error) {
        ctx.status = 400
        ctx.body = {
          success: false,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            type: 'control_error'
          },
          timestamp: Date.now()
        }
      }
    })

    // GET method for simple control actions
    this.router.get('/api/control/:action', async (ctx) => {
      try {
        if (!webController.validateAccess(ctx.headers)) {
          ctx.status = 401
          ctx.body = { error: 'Unauthorized' }
          return
        }

        const { action } = ctx.params
        const result = await webController.handleAction(action as string)
        
        ctx.body = {
          success: true,
          data: result,
          timestamp: Date.now()
        }
      } catch (error) {
        ctx.status = 400
        ctx.body = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    })

    this.router.get('/health', async (ctx) => {
      const status = proxyStatusManager.getRunningStatus()
      const statistics = proxyStatusManager.getStatistics()

      ctx.body = {
        status: status.isRunning ? 'running' : 'stopped',
        uptime: status.uptime,
        statistics: {
          totalRequests: statistics.totalRequests,
          successRequests: statistics.successRequests,
          failedRequests: statistics.failedRequests,
          activeConnections: statistics.activeConnections,
        },
      }
    })

    this.router.get('/stats', async (ctx) => {
      const statistics = proxyStatusManager.getStatistics()
      ctx.body = statistics
    })

    this.app.use(this.router.routes())
    this.app.use(this.router.allowedMethods())

    this.app.use(async (ctx) => {
      ctx.status = 404
      ctx.body = {
        error: {
          message: `Route not found: ${ctx.method} ${ctx.path}`,
          type: 'not_found_error',
        },
      }
    })
  }

  /**
   * Setup error handler
   */
  private setupErrorHandler(): void {
    this.app.on('error', (err, ctx) => {
      const status = err.status || 500
      const message = err.message || 'Internal Server Error'

      storeManager.addLog('error', `Server error: ${message}`, {
        status,
        path: ctx.path,
        method: ctx.method,
        stack: err.stack,
      })
    })
  }

  /**
   * Check if a port is available
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer()
      
      server.on('error', () => {
        resolve(false)
      })
      
      server.on('listening', () => {
        server.close()
        resolve(true)
      })
      
      server.listen(port, '0.0.0.0')
    })
  }

  /**
   * Find an available port starting from the given port
   */
  private async findAvailablePort(startPort: number = 58080): Promise<number> {
    // Always check if the specified port is available first
    if (await this.isPortAvailable(startPort)) {
      return startPort
    }

    storeManager.addLog('info', `Port ${startPort} is occupied, searching for available port...`)
    
    // Check nearby ports (startPort to startPort + 100)
    for (let port = startPort + 1; port <= startPort + 100; port++) {
      if (await this.isPortAvailable(port)) {
        storeManager.addLog('info', `Found available port: ${port}`)
        return port
      }
    }
    
    // If no port found in range, try random ports
    storeManager.addLog('warn', `No available port in range ${startPort}-${startPort + 100}, trying random ports`)
    return new Promise((resolve) => {
      const server = createServer()
      server.listen(0, '0.0.0.0', () => {
        const port = (server.address() as any)?.port || 58080
        server.close(() => {
          storeManager.addLog('info', `Using random port: ${port}`)
          resolve(port)
        })
      })
    })
  }

  /**
   * Start server
   */
  async start(port?: number): Promise<boolean> {
    if (this.server) {
      return false
    }

    const configPort = port || proxyStatusManager.getPort() || 58080
    
    // Find available port (auto-detect if occupied)
    this.port = await this.findAvailablePort(configPort)

    return new Promise((resolve) => {
      try {
        this.server = this.app.listen(this.port, '0.0.0.0', () => {
          proxyStatusManager.start()
          proxyStatusManager.setPort(this.port)

          const message = this.port === configPort 
            ? `Proxy server started successfully on port ${this.port}`
            : `Proxy server started successfully on port ${this.port} (default ${configPort} was occupied)`
          
          storeManager.addLog('info', message)

          resolve(true)
        })

        this.server.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            storeManager.addLog('error', `Port ${this.port} is already in use`)
          } else {
            storeManager.addLog('error', `Server error: ${err.message}`)
          }
          this.server = null
          resolve(false)
        })

        this.server.on('close', () => {
          this.server = null
        })
      } catch (error) {
        storeManager.addLog('error', `Failed to start server: ${error instanceof Error ? error.message : 'Unknown error'}`)
        resolve(false)
      }
    })
  }

  /**
   * Stop server
   */
  async stop(): Promise<boolean> {
    if (!this.server) {
      return false
    }

    return new Promise((resolve) => {
      this.server!.close((err) => {
        if (err) {
          storeManager.addLog('error', `Failed to stop server: ${err.message}`)
          resolve(false)
          return
        }

        this.server = null
        proxyStatusManager.stop()

        storeManager.addLog('info', 'Proxy server stopped')

        resolve(true)
      })
    })
  }

  /**
   * Restart server
   */
  async restart(port?: number): Promise<boolean> {
    await this.stop()
    return this.start(port)
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null && proxyStatusManager.getRunningStatus().isRunning
  }

  /**
   * Get server port
   */
  getPort(): number {
    return this.port
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return proxyStatusManager.getStatistics()
  }

  /**
   * Get running status
   */
  getStatus() {
    return proxyStatusManager.getRunningStatus()
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    proxyStatusManager.resetStatistics()
  }

  /**
   * Get Web UI HTML content
   */
  private getWebUIHTML(): string {
    const currentPort = this.getPort()
    const isDefaultPort = currentPort === 58080
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chat2API Web Management</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .card { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
        .status-item { text-align: center; padding: 15px; background: #f8f9fa; border-radius: 6px; }
        .status-value { font-size: 2em; font-weight: bold; color: #007bff; }
        .status-label { color: #666; margin-top: 5px; }
        .btn { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; margin: 5px; }
        .btn-primary { background: #007bff; color: white; }
        .btn-success { background: #28a745; color: white; }
        .btn-danger { background: #dc3545; color: white; }
        .btn-warning { background: #ffc107; color: black; }
        .logs { max-height: 300px; overflow-y: auto; background: #f8f9fa; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px; }
        .log-entry { margin: 2px 0; padding: 2px 5px; border-radius: 2px; }
        .log-info { background: #d1ecf1; color: #0c5460; }
        .log-warn { background: #fff3cd; color: #856404; }
        .log-error { background: #f8d7da; color: #721c24; }
        .port-info { background: #e7f3ff; padding: 10px; border-radius: 4px; margin-bottom: 10px; border-left: 4px solid #007bff; }
        .port-occupied { background: #fff3cd; border-left-color: #ffc107; }
        .loading { display: inline-block; width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #007bff; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Chat2API Web Management</h1>
            <p>远程管理 Chat2API 桌面应用</p>
            <div class="port-info ${isDefaultPort ? '' : 'port-occupied'}">
                <strong>当前端口: ${currentPort}</strong>
                ${isDefaultPort ? '(默认端口)' : '(自动检测到可用端口，默认 58080 被占用)'}
            </div>
        </div>

        <div class="card">
            <h2>系统状态</h2>
            <div class="status-grid" id="systemStatus">
                <div class="status-item">
                    <div class="status-value" id="proxyStatus">-</div>
                    <div class="status-label">代理状态</div>
                </div>
                <div class="status-item">
                    <div class="status-value" id="proxyPort">${currentPort}</div>
                    <div class="status-label">代理端口</div>
                </div>
                <div class="status-item">
                    <div class="status-value" id="totalRequests">-</div>
                    <div class="status-label">总请求数</div>
                </div>
                <div class="status-item">
                    <div class="status-value" id="successRate">-</div>
                    <div class="status-label">成功率</div>
                </div>
            </div>
        </div>

        <div class="card">
            <h2>代理控制</h2>
            <button class="btn btn-success" onclick="startProxy()">启动代理</button>
            <button class="btn btn-danger" onclick="stopProxy()">停止代理</button>
            <button class="btn btn-warning" onclick="restartProxy()">重启代理</button>
            <button class="btn btn-primary" onclick="refreshStatus()">刷新状态</button>
            <div style="margin-top: 10px;">
                <input type="number" id="portInput" placeholder="端口号 (默认58080)" value="${currentPort}" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                <small style="color: #666; margin-left: 10px;">留空则使用默认端口 58080，冲突时自动检测</small>
            </div>
        </div>

        <div class="card">
            <h2>应用控制</h2>
            <button class="btn btn-primary" onclick="showWindow()">显示窗口</button>
            <button class="btn btn-warning" onclick="hideWindow()">隐藏窗口</button>
            <button class="btn btn-danger" onclick="restartApp()">重启应用</button>
        </div>

        <div class="card">
            <h2>实时日志</h2>
            <button class="btn btn-primary" onclick="refreshLogs()">刷新日志</button>
            <button class="btn btn-warning" onclick="clearLogs()">清空统计</button>
            <div class="logs" id="logsContainer"></div>
        </div>
    </div>

    <script>
        const API_BASE = '';
        const DEFAULT_PORT = 58080;
        let currentPort = ${currentPort};
        
        async function callAPI(action, params = {}) {
            try {
                const response = await fetch(\`\${API_BASE}/api/control/\${action}\`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(params)
                });
                
                const result = await response.json();
                
                if (!result.success) {
                    throw new Error(result.error || result.message || '操作失败');
                }
                
                return result.data;
            } catch (error) {
                console.error('API调用失败:', error);
                alert('操作失败: ' + error.message);
                throw error;
            }
        }
        
        async function startProxy() {
            const portInput = document.getElementById('portInput');
            const port = portInput.value ? parseInt(portInput.value) : DEFAULT_PORT;
            await callAPI('proxy.start', { port });
            currentPort = port;
            refreshStatus();
        }
        
        async function stopProxy() {
            await callAPI('proxy.stop');
            refreshStatus();
        }
        
        async function restartProxy() {
            const portInput = document.getElementById('portInput');
            const port = portInput.value ? parseInt(portInput.value) : DEFAULT_PORT;
            await callAPI('proxy.restart', { port });
            currentPort = port;
            refreshStatus();
        }
        
        async function showWindow() {
            await callAPI('system.showWindow');
        }
        
        async function hideWindow() {
            await callAPI('system.hideWindow');
        }
        
        async function restartApp() {
            if (confirm('确定要重启应用吗？')) {
                await callAPI('system.restart');
                alert('应用正在重启...');
            }
        }
        
        async function refreshStatus() {
            try {
                const status = await callAPI('system.getStatus');
                
                document.getElementById('proxyStatus').textContent = status.proxy.isRunning ? '运行中' : '已停止';
                document.getElementById('proxyPort').textContent = status.proxy.port;
                document.getElementById('totalRequests').textContent = status.statistics.totalRequests;
                
                const successRate = status.statistics.totalRequests > 0 
                    ? Math.round((status.statistics.successRequests / status.statistics.totalRequests) * 100)
                    : 0;
                document.getElementById('successRate').textContent = successRate + '%';
                
                // Update port input if different
                const portInput = document.getElementById('portInput');
                if (status.proxy.port !== parseInt(portInput.value)) {
                    portInput.value = status.proxy.port;
                }
                
                // Update port info
                const portInfo = document.querySelector('.port-info');
                const isDefault = status.proxy.port === DEFAULT_PORT;
                portInfo.className = \`port-info \${isDefault ? '' : 'port-occupied'}\`;
                portInfo.innerHTML = \`
                    <strong>当前端口: \${status.proxy.port}</strong>
                    \${isDefault ? '(默认端口)' : '(自动检测到可用端口，默认 58080 被占用)'}
                \`;
            } catch (error) {
                console.error('刷新状态失败:', error);
            }
        }
        
        async function refreshLogs() {
            try {
                const logs = await callAPI('logs.get', { limit: 50 });
                const container = document.getElementById('logsContainer');
                
                container.innerHTML = logs.map(log => 
                    \`<div class="log-entry log-\${log.level}">[\${new Date(log.timestamp).toLocaleTimeString()}] \${log.level.toUpperCase()}: \${log.message}</div>\`
                ).join('');
                
                container.scrollTop = container.scrollHeight;
            } catch (error) {
                console.error('刷新日志失败:', error);
            }
        }
        
        async function clearLogs() {
            await callAPI('statistics.reset');
            refreshStatus();
        }
        
        // Auto-refresh status every 5 seconds
        setInterval(refreshStatus, 5000);
        
        // Initialize on page load
        window.onload = function() {
            refreshStatus();
            refreshLogs();
        };
    </script>
</body>
</html>
    `
  }
}

export const proxyServer = new ProxyServer()
export default proxyServer
