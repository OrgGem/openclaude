import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import type {
  NonNullableUsage,
  SDKMessage,
} from '../entrypoints/agentSdkTypes.js'

export type OpenClaudeSdkPermissionMode =
  | 'interactive'
  | 'auto-allow'
  | 'auto-deny'

export type OpenClaudeSdkOutputFormat = 'text' | 'json'

export type OpenClaudeSdkPermissionRequest = {
  toolName: string
  toolInput: Record<string, unknown>
  toolUseId: string
}

export type OpenClaudeSdkPermissionHandler = (
  request: OpenClaudeSdkPermissionRequest,
) => Promise<boolean> | boolean

export type OpenClaudeSdkOutputPolicy = {
  /**
   * Base directory where SDK run folders are created.
   * Default: <cwd>/.openclaude-sdk-output
   */
  baseDirectory?: string
  /**
   * Optional stable folder name. If omitted, SDK generates one.
   */
  folderName?: string
  /**
   * Write result.json (default true)
   */
  writeResultJson?: boolean
  /**
   * Write manifest.json (default true)
   */
  writeManifestJson?: boolean
}

export type OpenClaudeSdkRequest = {
  prompt: string | ContentBlockParam[]
  workingDirectory?: string
  model?: string
  outputFormat?: OpenClaudeSdkOutputFormat
  outputPolicy?: OpenClaudeSdkOutputPolicy
  jsonSchema?: Record<string, unknown>
  metadata?: Record<string, unknown>
  permission?: {
    mode?: OpenClaudeSdkPermissionMode
    onRequest?: OpenClaudeSdkPermissionHandler
  }
}

export type OpenClaudeSdkRunArtifacts = {
  outputFolderPath: string
  resultPath?: string
  manifestPath?: string
}

export type OpenClaudeSdkManifest = {
  sdkVersion: string
  sessionId: string
  turnId: string
  createdAt: string
  outputFolderPath: string
  files: string[]
}

export type OpenClaudeSdkResult = {
  success: boolean
  status: 'success' | 'error' | 'interrupted'
  sessionId: string
  turnId: string
  resultText: string
  structuredResult?: unknown
  usage: NonNullableUsage
  outputFolderPath: string
  logs: string[]
  rawMessages: SDKMessage[]
  metadata?: Record<string, unknown>
  error?: string
}
