import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import YAML from 'yaml'
import { json } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  ensureGatewayProbed,
  getGatewayCapabilities,
} from '../../server/hermes-api'
import { BEARER_TOKEN, HERMES_API } from '../../server/gateway-capabilities'
import {
  ensureDiscovery,
  getDiscoveredModels,
  ensureProviderInConfig,
} from '../../server/local-provider-discovery'

const HERMES_HOME = process.env.HERMES_HOME ?? path.join(os.homedir(), '.hermes')
const MODELS_PATH = path.join(HERMES_HOME, 'models.json')
const CONFIG_PATH = path.join(HERMES_HOME, 'config.yaml')

type ModelEntry = {
  provider?: string
  id?: string
  name?: string
  [key: string]: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>
  return {}
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeModel(entry: unknown): ModelEntry | null {
  if (typeof entry === 'string') {
    const id = entry.trim()
    if (!id) return null
    return {
      id,
      name: id,
      provider: id.includes('/') ? id.split('/')[0] : 'unknown',
    }
  }
  const record = asRecord(entry)
  const id =
    readString(record.id) || readString(record.name) || readString(record.model)
  if (!id) return null
  return {
    ...record,
    id,
    name:
      readString(record.name) ||
      readString(record.display_name) ||
      readString(record.label) ||
      id,
    provider:
      readString(record.provider) ||
      readString(record.owned_by) ||
      (id.includes('/') ? id.split('/')[0] : 'unknown'),
  }
}

/**
 * Read user-configured models from active profile's models.json.
 */
function readHermesModelsJson(): Array<ModelEntry> {
  try {
    if (!fs.existsSync(MODELS_PATH)) return []
    const raw = fs.readFileSync(MODELS_PATH, 'utf-8')
    const entries = JSON.parse(raw)
    if (!Array.isArray(entries)) return []
    return entries
      .map((entry: unknown): ModelEntry | null => {
        const record = asRecord(entry)
        // models.json uses "model" field for the model ID
        const modelId = readString(record.model) || readString(record.id)
        if (!modelId) return null
        return {
          id: modelId,
          name: readString(record.name) || modelId,
          provider: readString(record.provider) || 'unknown',
        }
      })
      .filter((entry): entry is ModelEntry => entry !== null)
  } catch {
    return []
  }
}

/**
 * Read the default model from active profile's config.yaml using a proper YAML parser.
 */
function readHermesDefaultModel(): ModelEntry | null {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
    const parsed = YAML.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const config = parsed as Record<string, unknown>
    let modelId = ''
    let provider = ''
    const modelField = config.model
    if (typeof modelField === 'string') {
      modelId = modelField
      provider = (config.provider as string) || 'unknown'
    } else if (modelField && typeof modelField === 'object') {
      const modelObj = modelField as Record<string, unknown>
      modelId = (modelObj.default as string) || ''
      provider =
        (modelObj.provider as string) ||
        (config.provider as string) ||
        'unknown'
    }
    if (!modelId) return null
    return { id: modelId, name: modelId, provider }
  } catch {
    return null
  }
}

/**
 * Read models from custom_providers entries in config.yaml.
 * Each entry may have a `name` field and a `models` dict.
 */
function readCustomProviderModels(): Array<ModelEntry> {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return []
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
    const parsed = YAML.parse(raw)
    if (!parsed || typeof parsed !== 'object') return []
    const config = parsed as Record<string, unknown>
    const customProviders = Array.isArray(config.custom_providers)
      ? config.custom_providers
      : []

    const models: Array<ModelEntry> = []
    for (const cp of customProviders) {
      if (!cp || typeof cp !== 'object') continue
      const cpRecord = cp as Record<string, unknown>
      const providerName =
        typeof cpRecord.name === 'string' && cpRecord.name.trim()
          ? cpRecord.name.trim()
          : typeof cpRecord.key_env === 'string'
            ? cpRecord.key_env.replace(/_API_KEY$/i, '').toLowerCase()
            : 'custom'

      const modelsDict = cpRecord.models
      if (
        modelsDict &&
        typeof modelsDict === 'object' &&
        !Array.isArray(modelsDict)
      ) {
        for (const [modelId, modelCfg] of Object.entries(
          modelsDict as Record<string, unknown>,
        )) {
          if (!modelId) continue
          const cfg =
            modelCfg && typeof modelCfg === 'object'
              ? (modelCfg as Record<string, unknown>)
              : {}
          models.push({
            id: modelId,
            name: modelId,
            provider: providerName,
            ...(typeof cfg.context_length === 'number'
              ? { context_length: cfg.context_length }
              : {}),
          })
        }
      }

      // Also include the default model if not already in the dict
      const defaultModel =
        typeof cpRecord.model === 'string' ? cpRecord.model.trim() : ''
      if (defaultModel) {
        const alreadyAdded = models.some(
          (m) => m.provider === providerName && m.id === defaultModel,
        )
        if (!alreadyAdded) {
          models.push({ id: defaultModel, name: defaultModel, provider: providerName })
        }
      }
    }
    return models
  } catch {
    return []
  }
}

/**
 * Fallback: fetch models from the hermes-agent /v1/models endpoint.
 */
async function fetchHermesModels(): Promise<Array<ModelEntry>> {
  const headers: Record<string, string> = {}
  if (BEARER_TOKEN) headers['Authorization'] = `Bearer ${BEARER_TOKEN}`
  const response = await fetch(`${HERMES_API}/v1/models`, { headers })
  if (!response.ok)
    throw new Error(`Hermes models request failed (${response.status})`)
  const payload = asRecord(await response.json())
  const rawModels = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.models)
      ? payload.models
      : []
  return rawModels
    .map(normalizeModel)
    .filter((e): e is ModelEntry => e !== null)
}

export const Route = createFileRoute('/api/models')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        await ensureGatewayProbed()

        try {
          // Primary: read user-configured models from ~/.hermes/models.json
          let models = readHermesModelsJson()
          let source = 'models.json'

          // Ensure the default model from config.yaml is always included
          const defaultModel = readHermesDefaultModel()
          if (defaultModel) {
            const hasDefault = models.some((m) => m.id === defaultModel.id)
            if (!hasDefault) {
              models.unshift(defaultModel)
            }
          }

          // Fallback: if no models.json, fetch from hermes-agent /v1/models
          if (models.length === 0 && getGatewayCapabilities().models) {
            models = await fetchHermesModels()
            source = 'hermes-agent'
          }

          // Merge models from custom_providers in config.yaml
          const customModels = readCustomProviderModels()
          {
            const existingCustomIds = new Set(models.map((m) => m.id))
            for (const m of customModels) {
              if (m.id && !existingCustomIds.has(m.id)) {
                models.push(m)
                existingCustomIds.add(m.id)
              }
            }
          }

          // Merge auto-discovered local models (Ollama, Atomic Chat, etc.)
          await ensureDiscovery()
          const localModels = getDiscoveredModels()
          const existingIds = new Set(models.map((m) => m.id))
          for (const m of localModels) {
            if (!existingIds.has(m.id)) {
              models.push(m)
              existingIds.add(m.id)
              ensureProviderInConfig(m.provider)
            }
          }

          const configuredProviders = Array.from(
            new Set(
              models
                .map((model) =>
                  typeof model.provider === 'string' ? model.provider : '',
                )
                .filter(Boolean),
            ),
          )

          return json({
            ok: true,
            object: 'list',
            data: models,
            models,
            configuredProviders,
            source,
          })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 503 },
          )
        }
      },
    },
  },
})
