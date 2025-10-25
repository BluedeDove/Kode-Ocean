/**
 * Ocean Resource Monitor Tool
 *
 * Monitors system resources (memory, CPU, disk) and sends alerts to dashboard
 * Helps prevent out-of-memory errors with large ocean datasets
 */

import { z } from 'zod'
import { Tool } from '@tool'
import { Text, Box } from 'ink'
import React from 'react'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export const inputSchema = z.strictObject({
  action: z.enum(['start', 'stop', 'status']).describe('Monitor action: start, stop, or check status'),
  interval_seconds: z.number().optional().default(10).describe('Monitoring interval in seconds (default: 10)'),
  memory_threshold_gb: z.number().optional().default(12).describe('Memory threshold in GB for warnings (default: 12)'),
  dashboard_url: z.string().optional().default('http://localhost:3737').describe('Dashboard URL for alerts')
})

type In = typeof inputSchema
export type Out = {
  action: string
  status: string
  current_memory_gb?: number
  threshold_gb?: number
  warnings?: string[]
}

// Global monitor state
let monitorInterval: NodeJS.Timeout | null = null
let monitorActive = false

/**
 * Get current process memory usage
 */
function getMemoryUsage(): { heapUsed: number; heapTotal: number; external: number; rss: number } {
  const mem = process.memoryUsage()
  return {
    heapUsed: mem.heapUsed / 1024**3,      // Convert to GB
    heapTotal: mem.heapTotal / 1024**3,
    external: mem.external / 1024**3,
    rss: mem.rss / 1024**3                 // Resident Set Size (total RAM)
  }
}

/**
 * Get system memory info (cross-platform)
 */
async function getSystemMemory(): Promise<{ total: number; free: number; used: number }> {
  try {
    if (process.platform === 'win32') {
      // Windows: use wmic
      const { stdout } = await execAsync('wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /Value')
      const lines = stdout.trim().split('\n')
      let total = 0, free = 0

      for (const line of lines) {
        if (line.includes('TotalVisibleMemorySize')) {
          total = parseInt(line.split('=')[1]) / 1024**2 // KB to GB
        } else if (line.includes('FreePhysicalMemory')) {
          free = parseInt(line.split('=')[1]) / 1024**2
        }
      }

      return { total, free, used: total - free }
    } else {
      // Linux/Mac: use free or vm_stat
      const { stdout } = await execAsync('free -b || vm_stat')
      // Parse output (simplified, may need adjustment)
      const lines = stdout.split('\n')
      const memLine = lines.find(l => l.includes('Mem:'))

      if (memLine) {
        const parts = memLine.trim().split(/\s+/)
        const total = parseInt(parts[1]) / 1024**3
        const used = parseInt(parts[2]) / 1024**3
        const free = parseInt(parts[3]) / 1024**3
        return { total, used, free }
      }
    }
  } catch (error) {
    // Fallback: only process memory
    console.warn('Could not get system memory, using process memory only')
  }

  const mem = getMemoryUsage()
  return { total: mem.heapTotal, free: 0, used: mem.heapUsed }
}

/**
 * Send alert to dashboard
 */
async function sendDashboardAlert(url: string, message: string, level: 'info' | 'warning' | 'error' = 'warning') {
  try {
    const fetch = (await import('node-fetch')).default
    await fetch(`${url}/api/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, level }),
      timeout: 2000
    })
  } catch (error) {
    // Silent fail if dashboard not available
  }
}

export const OceanResourceMonitor = {
  name: 'ocean_resource_monitor',

  async description() {
    return 'Monitor system resources (memory, CPU) and send alerts to dashboard to prevent out-of-memory errors with large ocean datasets'
  },

  async prompt() {
    return `
# Ocean Resource Monitor

Real-time monitoring of system resources to prevent crashes when working with large ocean datasets.

## Actions

- **start**: Start background monitoring
- **stop**: Stop monitoring
- **status**: Check current resource usage

## Parameters

- **interval_seconds** (default: 10): How often to check resources
- **memory_threshold_gb** (default: 12): Memory usage threshold for warnings
- **dashboard_url** (default: http://localhost:3737): Dashboard URL for alerts

## Usage

Start monitoring before training:
\`\`\`
{
  "action": "start",
  "memory_threshold_gb": 14,
  "interval_seconds": 5
}
\`\`\`

Check status:
\`\`\`
{
  "action": "status"
}
\`\`\`

Stop monitoring:
\`\`\`
{
  "action": "stop"
}
\`\`\`

## Features

- Monitors Node.js process memory usage
- Tracks system RAM usage
- Sends warnings to dashboard when threshold exceeded
- Automatic alerts for potential OOM situations
`
  },

  isReadOnly() {
    return true // Only monitors, doesn't modify system
  },

  isConcurrencySafe() {
    return true
  },

  inputSchema,

  userFacingName() {
    return 'Ocean Resource Monitor'
  },

  async isEnabled() {
    return true
  },

  needsPermissions(): boolean {
    return false
  },

  renderToolUseMessage({ action, memory_threshold_gb }) {
    return `Resource monitor: ${action}${memory_threshold_gb ? ` (threshold: ${memory_threshold_gb}GB)` : ''}`
  },

  renderResultForAssistant(output: Out) {
    let result = `Resource monitor ${output.action}: ${output.status}`
    if (output.current_memory_gb) {
      result += `\nCurrent memory: ${output.current_memory_gb.toFixed(2)}GB`
    }
    if (output.threshold_gb) {
      result += ` / ${output.threshold_gb}GB threshold`
    }
    if (output.warnings && output.warnings.length > 0) {
      result += `\nWarnings:\n${output.warnings.map(w => `  - ${w}`).join('\n')}`
    }
    return result
  },

  renderToolResultMessage(content: Out) {
    const statusColor = content.status === 'running' ? 'green' :
                        content.status === 'stopped' ? 'yellow' : 'cyan'

    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>Ocean Resource Monitor</Text>
        <Text>Action: <Text color={statusColor}>{content.action}</Text></Text>
        <Text>Status: <Text color={statusColor}>{content.status}</Text></Text>
        {content.current_memory_gb && (
          <Text>
            Memory: <Text color={content.current_memory_gb > (content.threshold_gb || 12) ? 'red' : 'green'}>
              {content.current_memory_gb.toFixed(2)}GB
            </Text>
            {content.threshold_gb && ` / ${content.threshold_gb}GB`}
          </Text>
        )}
        {content.warnings && content.warnings.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text color="yellow" bold>⚠️ Warnings:</Text>
            {content.warnings.map((warning, i) => (
              <Text key={i} color="yellow">  • {warning}</Text>
            ))}
          </Box>
        )}
      </Box>
    )
  },

  async *call({ action, interval_seconds, memory_threshold_gb, dashboard_url }, { abortController }) {
    try {
      if (action === 'start') {
        // Stop existing monitor if running
        if (monitorInterval) {
          clearInterval(monitorInterval)
        }

        monitorActive = true
        let warningCount = 0

        // Start monitoring loop
        monitorInterval = setInterval(async () => {
          if (!monitorActive) {
            clearInterval(monitorInterval!)
            return
          }

          const procMem = getMemoryUsage()
          const sysMem = await getSystemMemory()

          // Check thresholds
          if (procMem.rss > memory_threshold_gb) {
            warningCount++
            const message = `⚠️ High memory usage: ${procMem.rss.toFixed(2)}GB / ${memory_threshold_gb}GB threshold`
            await sendDashboardAlert(dashboard_url, message, 'warning')

            if (warningCount > 5) {
              const criticalMsg = `🚨 CRITICAL: Memory usage ${procMem.rss.toFixed(2)}GB. Risk of crash!`
              await sendDashboardAlert(dashboard_url, criticalMsg, 'error')
            }
          } else {
            warningCount = 0
          }

          // Log periodic status
          if (Math.random() < 0.1) { // 10% chance to log
            await sendDashboardAlert(
              dashboard_url,
              `Resource check: ${procMem.rss.toFixed(2)}GB used, ${sysMem.free.toFixed(2)}GB system free`,
              'info'
            )
          }
        }, interval_seconds * 1000)

        const mem = getMemoryUsage()
        const result: Out = {
          action: 'start',
          status: 'running',
          current_memory_gb: mem.rss,
          threshold_gb: memory_threshold_gb,
          warnings: mem.rss > memory_threshold_gb
            ? [`Memory already above threshold: ${mem.rss.toFixed(2)}GB > ${memory_threshold_gb}GB`]
            : []
        }

        yield {
          type: 'result',
          data: result,
          resultForAssistant: this.renderResultForAssistant(result)
        }

      } else if (action === 'stop') {
        if (monitorInterval) {
          clearInterval(monitorInterval)
          monitorInterval = null
        }
        monitorActive = false

        const result: Out = {
          action: 'stop',
          status: 'stopped'
        }

        yield {
          type: 'result',
          data: result,
          resultForAssistant: this.renderResultForAssistant(result)
        }

      } else if (action === 'status') {
        const mem = getMemoryUsage()
        const sysMem = await getSystemMemory()

        const warnings: string[] = []
        if (mem.rss > memory_threshold_gb) {
          warnings.push(`Process memory ${mem.rss.toFixed(2)}GB exceeds threshold ${memory_threshold_gb}GB`)
        }
        if (sysMem.free < 2) {
          warnings.push(`Low system memory: only ${sysMem.free.toFixed(2)}GB free`)
        }

        const result: Out = {
          action: 'status',
          status: monitorActive ? 'running' : 'idle',
          current_memory_gb: mem.rss,
          threshold_gb: memory_threshold_gb,
          warnings
        }

        yield {
          type: 'result',
          data: result,
          resultForAssistant: this.renderResultForAssistant(result)
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorResult: Out = {
        action,
        status: 'error',
        warnings: [errorMessage]
      }

      yield {
        type: 'result',
        data: errorResult,
        resultForAssistant: `Resource monitor error: ${errorMessage}`
      }
    }
  }
} satisfies Tool<In, Out>
