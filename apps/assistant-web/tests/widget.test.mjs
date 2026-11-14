import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const widgetScript = await readFile(new URL('../public/widget.js', import.meta.url), 'utf8')

function loadWidget(localStorage, sessionId = 'session-id') {
  const iframe = { style: {}, contentWindow: {} }
  const document = {
    currentScript: {
      dataset: { apiKey: 'embed_key_for_test' },
      src: 'https://assistant.example.com/widget.js',
    },
    body: { append: (element) => assert.equal(element, iframe) },
    createElement: () => iframe,
  }
  const window = {
    crypto: { randomUUID: () => sessionId },
    localStorage,
    location: { origin: 'https://customer.example' },
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener() {},
  }

  runInNewContext(widgetScript, { document, window, URL, URLSearchParams })
  return new URL(iframe.src)
}

test('persists the embed session in the embedding site and reuses it', () => {
  const values = new Map()
  const localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }

  const first = loadWidget(localStorage)
  const second = loadWidget(localStorage, 'new-session-should-not-be-used')

  assert.equal(first.href, second.href)
  assert.equal(new URLSearchParams(first.hash.slice(1)).get('apiKey'), 'embed_key_for_test')
  assert.equal(new URLSearchParams(first.hash.slice(1)).get('sessionId'), 'session-id')
  assert.equal(values.size, 1)
})

test('loads with an in-memory session when site storage is unavailable', () => {
  const url = loadWidget({
    getItem: () => {
      throw new Error('storage blocked')
    },
  })

  assert.equal(new URLSearchParams(url.hash.slice(1)).get('sessionId'), 'session-id')
})
