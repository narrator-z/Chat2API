import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { deepseekConfig } from '../../src/main/providers/builtin/deepseek.ts'
import { kimiConfig } from '../../src/main/providers/builtin/kimi.ts'
import {
  createKimiChatPayload,
  encodeKimiGrpcFrame,
  resolveDeepSeekChatOptions,
  resolveKimiScenario,
} from '../../src/main/proxy/adapters/providerModelOptions.ts'

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

test('DeepSeek V4 models drive the actual upstream mode flags', () => {
  assert.ok(deepseekConfig.supportedModels.includes('deepseek-v4-pro'))
  assert.ok(deepseekConfig.supportedModels.includes('deepseek-v4-flash'))
  assert.ok(deepseekConfig.supportedModels.includes('deepseek-reasoner'))
  assert.equal(deepseekConfig.modelMappings?.['deepseek-v4-pro'], 'deepseek-chat')

  assert.deepEqual(
    resolveDeepSeekChatOptions({ model: 'deepseek-v4-pro' }),
    { modelType: 'expert', searchEnabled: false, thinkingEnabled: false },
  )
  assert.deepEqual(
    resolveDeepSeekChatOptions({ model: 'deepseek-v4-flash' }),
    { modelType: 'default', searchEnabled: false, thinkingEnabled: false },
  )
  assert.deepEqual(
    resolveDeepSeekChatOptions({ model: 'deepseek-v4-pro-think-search' }),
    { modelType: 'expert', searchEnabled: true, thinkingEnabled: true },
  )
  assert.deepEqual(
    resolveDeepSeekChatOptions({ model: 'deepseek-reasoner' }),
    { modelType: 'default', searchEnabled: false, thinkingEnabled: true },
  )
})

test('Kimi K2.6 model mapping reaches the web chat request payload', () => {
  assert.deepEqual(kimiConfig.supportedModels, ['Kimi-K2.6', 'Kimi-K2.5'])
  assert.equal(kimiConfig.modelMappings?.['Kimi-K2.6'], 'kimi-k2.6')
  assert.equal(resolveKimiScenario('kimi-k2.6'), 'SCENARIO_K2D6')
  assert.equal(resolveKimiScenario('kimi-k2.5'), 'SCENARIO_K2D5')

  const payload = createKimiChatPayload({
    model: 'kimi-k2.6',
    content: 'hello',
    enableWebSearch: true,
    enableThinking: true,
  })

  assert.equal(payload.scenario, 'SCENARIO_K2D6')
  assert.equal(payload.message.scenario, 'SCENARIO_K2D6')
  assert.deepEqual(payload.tools, [{ type: 'TOOL_TYPE_SEARCH', search: {} }])
  assert.equal(payload.options.thinking, true)

  const frame = encodeKimiGrpcFrame(payload)
  assert.equal(frame.readUInt8(0), 0)
  assert.equal(frame.readUInt32BE(1), frame.length - 5)
  assert.equal(JSON.parse(frame.subarray(5).toString('utf8')).scenario, 'SCENARIO_K2D6')
})

test('Add provider dialog templates match the updated DeepSeek and Kimi flows', () => {
  const source = readFileSync(
    join(root, 'src/renderer/src/components/providers/AddProviderDialog.tsx'),
    'utf8',
  )

  assert.match(source, /supportedModels: \['deepseek-v4-pro'.*'deepseek-reasoner'/s)
  assert.match(source, /'deepseek-v4-pro': 'deepseek-chat'/)
  assert.match(source, /supportedModels: \['Kimi-K2\.6', 'Kimi-K2\.5'\]/)
  assert.match(source, /'Kimi-K2\.6': 'kimi-k2\.6'/)
  assert.match(source, /'Content-Type': 'application\/connect\+json'/)
  assert.doesNotMatch(source, /supportedModels: \['kimi', 'kimi-search', 'kimi-research', 'kimi-k1'\]/)
})
