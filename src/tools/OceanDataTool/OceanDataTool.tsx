/**
 * Ocean Data Tool
 *
 * Loads and validates ocean data in various formats (HDF5, NetCDF, etc.)
 */

import { z } from 'zod'
import { Tool } from '@tool'
import { Text, Box } from 'ink'
import React from 'react'
import { resolve, join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { getCwd } from '@utils/state'
import { existsSync } from 'fs'

const execFileAsync = promisify(execFile)

export const inputSchema = z.strictObject({
  filepath: z.string().describe('Path to the ocean data file (HDF5, NetCDF, etc.)'),
  format: z.enum(['auto', 'hdf5', 'netcdf']).optional().default('auto').describe('File format (auto-detect by default)'),
  dashboard_url: z.string().optional().default('http://localhost:3737').describe('Dashboard URL for updates')
})

type In = typeof inputSchema
export type Out = {
  success: boolean
  metadata?: {
    format: string
    filepath: string
    variables: string[]
    shape: number[]
    loaded: boolean
    datasets?: Record<string, any>
    dimensions?: Record<string, number>
  }
  error?: string
}

export const OceanDataTool = {
  name: 'ocean_load_data',

  async description() {
    return 'Load and validate ocean data files (HDF5, NetCDF, etc.) and update the dashboard with data information'
  },

  async prompt() {
    return `
# Ocean Data Tool

Load and validate ocean data files in various formats.

## Supported Formats

- **HDF5** (.h5, .hdf5, .hdf)
- **NetCDF** (.nc, .nc4, .netcdf)
- More formats can be added as needed

## Features

- Auto-detect file format from extension
- Extract data shape and variables
- Validate data integrity
- Update dashboard with data information
- Support for multi-dimensional ocean data

## Usage

Load HDF5 data (auto-detect):
\`\`\`
{
  "filepath": "path/to/ocean_data.h5"
}
\`\`\`

Specify format explicitly:
\`\`\`
{
  "filepath": "path/to/data.nc",
  "format": "netcdf"
}
\`\`\`

## Python Requirements

This tool requires Python with:
- h5py (for HDF5 files)
- netCDF4 (for NetCDF files)
- numpy
- requests

Install with: \`conda activate agentUse && pip install h5py netCDF4 numpy requests\`

## Notes

- Uses conda environment 'agentUse' by default
- Automatically updates the Ocean Dashboard with data info
- Returns metadata including shape, variables, and format
`
  },

  isReadOnly() {
    return true // Only reads data, doesn't modify
  },

  isConcurrencySafe() {
    return true
  },

  inputSchema,

  userFacingName() {
    return 'Ocean Data Loader'
  },

  async isEnabled() {
    return true
  },

  needsPermissions(): boolean {
    return false // Reading data files is safe
  },

  renderToolUseMessage({ filepath, format }) {
    return `Loading ocean data from ${filepath} (format: ${format})`
  },

  renderResultForAssistant(output: Out) {
    if (!output.success) {
      return `Error loading data: ${output.error}`
    }

    const meta = output.metadata!
    return `Data loaded successfully:
- Format: ${meta.format}
- Shape: ${meta.shape.join(' × ')}
- Variables: ${meta.variables.join(', ')}
- File: ${meta.filepath}
Dashboard has been updated with data information.`
  },

  renderToolResultMessage(content: Out) {
    if (!content.success) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text color="red" bold>Error Loading Ocean Data</Text>
          <Text color="red">{content.error}</Text>
        </Box>
      )
    }

    const meta = content.metadata!
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan" bold>Ocean Data Loaded Successfully</Text>
        <Text>Format: <Text color="green">{meta.format}</Text></Text>
        <Text>Shape: <Text color="yellow">{meta.shape.join(' × ')}</Text></Text>
        <Text>Variables: <Text color="blue">{meta.variables.join(', ')}</Text></Text>
        <Text>File: {meta.filepath}</Text>
      </Box>
    )
  },

  async *call({ filepath, format, dashboard_url }, { abortController }) {
    try {
      // Resolve filepath relative to cwd
      const fullPath = resolve(getCwd(), filepath)

      yield {
        type: 'progress' as const,
        content: `Loading ocean data from ${filepath}...`
      }

      // Check if file exists
      if (!existsSync(fullPath)) {
        const errorResult: Out = {
          success: false,
          error: `File not found: ${fullPath}`
        }

        yield {
          type: 'result' as const,
          data: errorResult,
          resultForAssistant: this.renderResultForAssistant(errorResult)
        }
        return
      }

      // Get path to Python script
      const scriptPath = join(__dirname, '..', '..', '..', 'ocean_scripts', 'data_loader.py')

      if (!existsSync(scriptPath)) {
        const errorResult: Out = {
          success: false,
          error: `Python script not found: ${scriptPath}`
        }

        yield {
          type: 'result' as const,
          data: errorResult,
          resultForAssistant: this.renderResultForAssistant(errorResult)
        }
        return
      }

      // Prepare command to run with conda
      // Use conda run to activate the agentUse environment
      const args = [
        'run',
        '-n',
        'agentUse',
        'python',
        scriptPath,
        fullPath,
        '--dashboard-url',
        dashboard_url,
        '--format',
        format
      ]

      yield {
        type: 'progress' as const,
        content: 'Running data loader with conda environment agentUse...'
      }

      // Execute Python script
      const { stdout, stderr } = await execFileAsync('conda', args, {
        cwd: getCwd(),
        timeout: 60000, // 60 seconds timeout
        signal: abortController.signal,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      })

      // Parse output
      let result: Out
      try {
        result = JSON.parse(stdout)
      } catch (parseError) {
        result = {
          success: false,
          error: `Failed to parse output: ${parseError}\nOutput: ${stdout}\nStderr: ${stderr}`
        }
      }

      if (result.success) {
        yield {
          type: 'progress' as const,
          content: `Data loaded: ${result.metadata!.format} with ${result.metadata!.variables.length} variables`
        }
      }

      yield {
        type: 'result' as const,
        data: result,
        resultForAssistant: this.renderResultForAssistant(result)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorResult: Out = {
        success: false,
        error: errorMessage
      }

      yield {
        type: 'result' as const,
        data: errorResult,
        resultForAssistant: this.renderResultForAssistant(errorResult)
      }
    }
  }
} satisfies Tool<In, Out>
