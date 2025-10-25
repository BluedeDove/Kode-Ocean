/**
 * Ocean ML Dashboard Server
 *
 * Real-time dashboard for monitoring ocean machine learning workflows
 * Provides WebSocket updates for training progress, visualizations, and metrics
 */

import express, { Express, Request, Response } from 'express'
import { Server as HTTPServer, createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { homedir } from 'os'

/**
 * Dashboard state interface
 */
export interface DashboardState {
  // Model information
  modelVariables: Record<string, any>
  modelArchitecture: string | null

  // Training status
  trainingStatus: 'idle' | 'running' | 'paused' | 'completed' | 'error'
  currentEpoch: number
  totalEpochs: number

  // Training metrics
  trainingMetrics: {
    epoch: number
    loss: number
    metrics: Record<string, number>
    timestamp: number
  }[]

  // Visualizations
  visualizations: {
    id: string
    type: 'data' | 'error' | 'metric' | 'curve'
    title: string
    imagePath: string
    timestamp: number
  }[]

  // Data information
  dataInfo: {
    format: string
    shape: number[]
    variables: string[]
    loaded: boolean
  } | null

  // Logs
  logs: {
    level: 'info' | 'warning' | 'error'
    message: string
    timestamp: number
  }[]
}

/**
 * Ocean Dashboard Server class
 */
export class OceanDashboardServer {
  private app: Express
  private httpServer: HTTPServer
  private io: SocketIOServer
  private port: number
  private isRunning: boolean = false
  private state: DashboardState
  private stateFilePath: string

  constructor(port: number = 3737) {
    this.port = port
    this.app = express()
    this.httpServer = createServer(this.app)
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    })

    // Initialize state
    this.stateFilePath = join(homedir(), '.kode', 'ocean_dashboard_state.json')
    this.state = this.loadState()

    this.setupMiddleware()
    this.setupRoutes()
    this.setupWebSocket()
  }

  /**
   * Load persisted state from disk
   */
  private loadState(): DashboardState {
    try {
      if (existsSync(this.stateFilePath)) {
        const data = readFileSync(this.stateFilePath, 'utf-8')
        return JSON.parse(data)
      }
    } catch (error) {
      console.warn('Failed to load dashboard state:', error)
    }

    // Return default state
    return {
      modelVariables: {},
      modelArchitecture: null,
      trainingStatus: 'idle',
      currentEpoch: 0,
      totalEpochs: 0,
      trainingMetrics: [],
      visualizations: [],
      dataInfo: null,
      logs: []
    }
  }

  /**
   * Save state to disk
   */
  private saveState(): void {
    try {
      const dir = join(homedir(), '.kode')
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2))
    } catch (error) {
      console.error('Failed to save dashboard state:', error)
    }
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(express.json())

    // Serve static files from public directory (dashboard UI)
    this.app.use(express.static(join(__dirname, 'public')))

    // CRITICAL: Serve static files from working directories (training outputs)
    // This allows access to images like /outputs/plot.png from ocean-workspace

    // Serve from current working directory
    this.app.use(express.static(process.cwd()))

    // Also serve from common ocean-workspace locations
    const commonWorkspacePaths = [
      join(process.cwd(), 'ocean-workspace'),
      join(process.cwd(), '..', 'ocean-workspace'),
      // Absolute path as fallback
      'E:\\个人项目\\海洋KODE魔改\\ocean-workspace'
    ]

    for (const path of commonWorkspacePaths) {
      if (existsSync(path)) {
        this.app.use(express.static(path))
        console.log(`[Dashboard] Serving static files from: ${path}`)
      }
    }
  }

  /**
   * Setup HTTP routes
   */
  private setupRoutes(): void {
    // Get current state
    this.app.get('/api/state', (req: Request, res: Response) => {
      res.json(this.state)
    })

    // Update model variables
    this.app.post('/api/model/variables', (req: Request, res: Response) => {
      this.state.modelVariables = { ...this.state.modelVariables, ...req.body }
      this.saveState()
      this.io.emit('model:variables', this.state.modelVariables)
      res.json({ success: true })
    })

    // Update model architecture
    this.app.post('/api/model/architecture', (req: Request, res: Response) => {
      this.state.modelArchitecture = req.body.architecture
      this.saveState()
      this.io.emit('model:architecture', this.state.modelArchitecture)
      res.json({ success: true })
    })

    // Update training status
    this.app.post('/api/training/status', (req: Request, res: Response) => {
      this.state.trainingStatus = req.body.status
      this.state.currentEpoch = req.body.currentEpoch || this.state.currentEpoch
      this.state.totalEpochs = req.body.totalEpochs || this.state.totalEpochs
      this.saveState()
      this.io.emit('training:status', {
        status: this.state.trainingStatus,
        currentEpoch: this.state.currentEpoch,
        totalEpochs: this.state.totalEpochs
      })
      res.json({ success: true })
    })

    // Add training metric
    this.app.post('/api/training/metric', (req: Request, res: Response) => {
      const metric = {
        epoch: req.body.epoch,
        loss: req.body.loss,
        metrics: req.body.metrics || {},
        timestamp: Date.now()
      }
      this.state.trainingMetrics.push(metric)
      this.saveState()
      this.io.emit('training:metric', metric)
      res.json({ success: true })
    })

    // Add visualization
    this.app.post('/api/visualization', (req: Request, res: Response) => {
      const viz = {
        id: req.body.id || `viz_${Date.now()}`,
        type: req.body.type,
        title: req.body.title,
        imagePath: req.body.imagePath,
        timestamp: Date.now()
      }
      this.state.visualizations.push(viz)
      this.saveState()
      this.io.emit('visualization:new', viz)
      res.json({ success: true })
    })

    // Update data info
    this.app.post('/api/data/info', (req: Request, res: Response) => {
      this.state.dataInfo = req.body
      this.saveState()
      this.io.emit('data:info', this.state.dataInfo)
      res.json({ success: true })
    })

    // Add log
    this.app.post('/api/log', (req: Request, res: Response) => {
      const log = {
        level: req.body.level || 'info',
        message: req.body.message,
        timestamp: Date.now()
      }
      this.state.logs.push(log)
      // Keep only last 1000 logs
      if (this.state.logs.length > 1000) {
        this.state.logs = this.state.logs.slice(-1000)
      }
      this.saveState()
      this.io.emit('log:new', log)
      res.json({ success: true })
    })

    // Clear all data
    this.app.post('/api/clear', (req: Request, res: Response) => {
      this.state = {
        modelVariables: {},
        modelArchitecture: null,
        trainingStatus: 'idle',
        currentEpoch: 0,
        totalEpochs: 0,
        trainingMetrics: [],
        visualizations: [],
        dataInfo: null,
        logs: []
      }
      this.saveState()
      this.io.emit('state:cleared')
      res.json({ success: true })
    })

    // Health check
    this.app.get('/api/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', port: this.port })
    })

    // Serve main dashboard page
    this.app.get('/', (req: Request, res: Response) => {
      res.sendFile(join(__dirname, 'public', 'index.html'))
    })
  }

  /**
   * Setup WebSocket handlers
   */
  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      console.log('Client connected to Ocean Dashboard')

      // Send current state to new client
      socket.emit('state:initial', this.state)

      socket.on('disconnect', () => {
        console.log('Client disconnected from Ocean Dashboard')
      })
    })
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`Dashboard already running on port ${this.port}`)
      return
    }

    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.port, () => {
        this.isRunning = true
        console.log(`Ocean Dashboard started on http://localhost:${this.port}`)
        resolve()
      }).on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.log(`Port ${this.port} already in use, dashboard may already be running`)
          this.isRunning = true
          resolve()
        } else {
          reject(error)
        }
      })
    })
  }

  /**
   * Stop the server
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    return new Promise((resolve) => {
      this.httpServer.close(() => {
        this.isRunning = false
        console.log('Ocean Dashboard stopped')
        resolve()
      })
    })
  }

  /**
   * Get server URL
   */
  public getURL(): string {
    return `http://localhost:${this.port}`
  }

  /**
   * Check if server is running
   */
  public getIsRunning(): boolean {
    return this.isRunning
  }
}

// Singleton instance
let dashboardInstance: OceanDashboardServer | null = null

/**
 * Get or create dashboard server instance
 */
export function getDashboardServer(port: number = 3737): OceanDashboardServer {
  if (!dashboardInstance) {
    dashboardInstance = new OceanDashboardServer(port)
  }
  return dashboardInstance
}

/**
 * Start dashboard server
 */
export async function startDashboard(port: number = 3737): Promise<OceanDashboardServer> {
  const server = getDashboardServer(port)
  await server.start()
  return server
}

/**
 * Stop dashboard server
 */
export async function stopDashboard(): Promise<void> {
  if (dashboardInstance) {
    await dashboardInstance.stop()
    dashboardInstance = null
  }
}
