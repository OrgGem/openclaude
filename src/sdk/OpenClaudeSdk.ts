import { mkdir, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { randomUUID } from 'crypto'
import { QueryEngine } from '../QueryEngine.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import { getDefaultAppState } from '../state/AppStateStore.js'
import type { AppState } from '../state/AppState.js'
import { getTools } from '../tools.js'
import {
  FileStateCache,
  READ_FILE_STATE_CACHE_SIZE,
} from '../utils/fileStateCache.js'
import type { PermissionDecision } from '../types/permissions.js'
import type { Tool } from '../Tool.js'
import {
  type OpenClaudeSdkManifest,
  type OpenClaudeSdkRequest,
  type OpenClaudeSdkResult,
} from './contracts.js'

const SDK_VERSION = '0.1.0'
const DEFAULT_OUTPUT_DIR_NAME = '.openclaude-sdk-output'
const SDK_FILE_CACHE_MAX_BYTES = 25 * 1024 * 1024

function formatFolderTimestamp(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${y}${m}${d}-${hh}${mm}${ss}`
}

function createAllowDecision(): PermissionDecision {
  return {
    behavior: 'allow',
    decisionReason: { type: 'other', reason: 'Approved by SDK policy' },
  }
}

function createDenyDecision(reason: string): PermissionDecision {
  return {
    behavior: 'deny',
    message: reason,
    decisionReason: { type: 'other', reason },
  }
}

type SessionInit = {
  workingDirectory: string
  model?: string
  jsonSchema?: Record<string, unknown>
  permission?: OpenClaudeSdkRequest['permission']
}

export class OpenClaudeSdkSession {
  readonly sessionId: string
  private appState: AppState
  private readonly fileCache: FileStateCache
  private engine: QueryEngine
  private workingDirectory: string

  constructor(init: SessionInit) {
    this.sessionId = randomUUID()
    this.appState = getDefaultAppState()
    this.fileCache = new FileStateCache(
      READ_FILE_STATE_CACHE_SIZE,
      SDK_FILE_CACHE_MAX_BYTES,
    )
    this.workingDirectory = resolve(init.workingDirectory)
    this.engine = this.createEngine(init)
  }

  setModel(model: string): void {
    this.engine.setModel(model)
  }

  async run(request: OpenClaudeSdkRequest): Promise<OpenClaudeSdkResult> {
    const turnId = randomUUID()
    const logs: string[] = []
    const rawMessages: OpenClaudeSdkResult['rawMessages'] = []
    let status: OpenClaudeSdkResult['status'] = 'success'
    let resultText = ''
    let structuredResult: unknown
    let usage: OpenClaudeSdkResult['usage'] = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      service_tier: 'standard',
    }
    let error: string | undefined

    try {
      for await (const msg of this.engine.submitMessage(request.prompt)) {
        rawMessages.push(msg)
        if (msg.type === 'stream_event') {
          const eventType = msg.event?.type
          logs.push(`stream_event:${eventType ?? 'unknown'}`)
          if (
            msg.event?.type === 'content_block_delta' &&
            msg.event.delta?.type === 'text_delta'
          ) {
            resultText += msg.event.delta.text
          }
          continue
        }

        if (msg.type === 'result') {
          usage = msg.usage ?? usage
          if (msg.subtype === 'success') {
            status = 'success'
            if (typeof msg.result === 'string') {
              resultText = msg.result
            }
            structuredResult = msg.structured_output
          } else {
            status = msg.subtype === 'error_during_execution' ? 'error' : 'interrupted'
            error = msg.subtype
          }
          continue
        }

        logs.push(msg.type)
      }
    } catch (err) {
      status = 'error'
      error = err instanceof Error ? err.message : String(err)
    }

    const artifacts = await this.persistArtifacts({
      turnId,
      request,
      status,
      resultText,
      structuredResult,
      usage,
      logs,
      rawMessages,
      error,
    })

    return {
      success: status === 'success',
      status,
      sessionId: this.sessionId,
      turnId,
      resultText,
      structuredResult,
      usage,
      outputFolderPath: artifacts.outputFolderPath,
      logs,
      rawMessages,
      metadata: request.metadata,
      error,
    }
  }

  private createEngine(init: SessionInit): QueryEngine {
    return new QueryEngine({
      cwd: this.workingDirectory,
      tools: getTools(this.appState.toolPermissionContext),
      commands: [],
      mcpClients: [],
      agents: [],
      canUseTool: this.createPermissionHandler(init.permission),
      getAppState: () => this.appState,
      setAppState: updater => {
        this.appState = updater(this.appState)
      },
      readFileCache: this.fileCache,
      userSpecifiedModel: init.model,
      fallbackModel: init.model,
      jsonSchema: init.jsonSchema,
      includePartialMessages: true,
    })
  }

  private createPermissionHandler(
    permission: OpenClaudeSdkRequest['permission'],
  ): CanUseToolFn {
    const mode = permission?.mode ?? 'interactive'
    const onRequest = permission?.onRequest

    return async (
      tool: Tool,
      input: Record<string, unknown>,
      _toolUseContext,
      _assistantMessage,
      toolUseID: string,
    ) => {
      if (mode === 'auto-allow') {
        return createAllowDecision()
      }

      if (mode === 'auto-deny') {
        return createDenyDecision('Denied by SDK auto-deny policy')
      }

      if (!onRequest) {
        return createDenyDecision(
          'Permission callback is required for interactive mode',
        )
      }

      const approved = await onRequest({
        toolName: tool.name,
        toolInput: input,
        toolUseId: toolUseID,
      })
      return approved
        ? createAllowDecision()
        : createDenyDecision('Denied by SDK interactive callback')
    }
  }

  private async persistArtifacts(params: {
    turnId: string
    request: OpenClaudeSdkRequest
    status: OpenClaudeSdkResult['status']
    resultText: string
    structuredResult: unknown
    usage: OpenClaudeSdkResult['usage']
    logs: string[]
    rawMessages: OpenClaudeSdkResult['rawMessages']
    error?: string
  }): Promise<{ outputFolderPath: string }> {
    const { turnId, request } = params
    const baseDirectory = resolve(
      request.outputPolicy?.baseDirectory ??
        join(this.workingDirectory, DEFAULT_OUTPUT_DIR_NAME),
    )
    const folderName =
      request.outputPolicy?.folderName ??
      `${formatFolderTimestamp(new Date())}-${turnId.slice(0, 8)}`
    const outputFolderPath = join(baseDirectory, folderName)
    await mkdir(outputFolderPath, { recursive: true })

    const writeResultJson = request.outputPolicy?.writeResultJson ?? true
    const writeManifestJson = request.outputPolicy?.writeManifestJson ?? true
    const files: string[] = []

    if (writeResultJson) {
      const resultPath = join(outputFolderPath, 'result.json')
      await writeFile(
        resultPath,
        JSON.stringify(
          {
            ...params,
            outputFolderPath,
            sessionId: this.sessionId,
          },
          null,
          2,
        ),
        'utf-8',
      )
      files.push('result.json')
    }

    if (writeManifestJson) {
      // Keep files as payload artifacts only; manifest is the index and does not
      // list itself to avoid self-referential metadata.
      const manifest: OpenClaudeSdkManifest = {
        sdkVersion: SDK_VERSION,
        sessionId: this.sessionId,
        turnId,
        createdAt: new Date().toISOString(),
        outputFolderPath,
        files,
      }
      await writeFile(
        join(outputFolderPath, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf-8',
      )
    }

    return { outputFolderPath }
  }
}

export type OpenClaudeSdkInit = {
  workingDirectory?: string
  model?: string
  jsonSchema?: Record<string, unknown>
  permission?: OpenClaudeSdkRequest['permission']
}

export class OpenClaudeSdk {
  private sessions = new Map<string, OpenClaudeSdkSession>()

  createSession(init: OpenClaudeSdkInit = {}): OpenClaudeSdkSession {
    const session = new OpenClaudeSdkSession({
      workingDirectory: init.workingDirectory ?? process.cwd(),
      model: init.model,
      jsonSchema: init.jsonSchema,
      permission: init.permission,
    })
    this.sessions.set(session.sessionId, session)
    return session
  }

  resumeSession(sessionId: string): OpenClaudeSdkSession | undefined {
    return this.sessions.get(sessionId)
  }

  async run(request: OpenClaudeSdkRequest): Promise<OpenClaudeSdkResult> {
    const session = this.createSession({
      workingDirectory: request.workingDirectory ?? process.cwd(),
      model: request.model,
      jsonSchema: request.jsonSchema,
      permission: request.permission,
    })
    return session.run(request)
  }
}
