"use client"

import { useEffect, useMemo, useState } from "react"
import { useChat } from "@ai-sdk/react"

type OpenRouterModel = {
  id: string
  name?: string
  pricing?: Record<string, string>
}

type ModelsResponse = {
  data: OpenRouterModel[]
}

function useModels(apiKey: string | null) {
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!apiKey) return
    let mounted = true
    setLoading(true)
    fetch("/api/models", { headers: { "x-openrouter-key": apiKey } })
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load models")
        const json: ModelsResponse = await r.json()
        return json.data || []
      })
      .then((data) => {
        if (mounted) setModels(data)
      })
      .catch((e) => setError(e.message || String(e)))
      .finally(() => setLoading(false))
    return () => {
      mounted = false
    }
  }, [apiKey])

  return { models, loading, error }
}

function ModelSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: OpenRouterModel[]
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-neutral-700 dark:text-neutral-200">{label}</span>
      <select
        className="border rounded px-2 py-1 text-sm bg-white text-black dark:bg-neutral-900 dark:text-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name ? `${m.name} (${m.id})` : m.id}
          </option>
        ))}
      </select>
    </div>
  )
}

function Panel({
  title,
  modelId,
  messages,
  status,
  stop,
}: {
  title: string
  modelId: string
  messages: { id: string; role: string; parts: { type: string; text?: string }[] }[]
  status: "submitted" | "streaming" | "ready" | "error"
  stop: () => void
}) {
  return (
    <div className="border rounded-lg p-3 h-[60vh] flex flex-col bg-white/90 dark:bg-neutral-950/90">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-sm text-neutral-900 dark:text-neutral-100">{title}</h3>
        <span className="text-xs text-neutral-600 dark:text-neutral-400">{modelId}</span>
      </div>
      <div className="flex-1 overflow-auto space-y-2 text-sm text-neutral-900 dark:text-neutral-100">
        {messages.map((m) => (
          <div key={m.id} className="whitespace-pre-wrap">
            <span className="font-semibold mr-1">
              {m.role === "user" ? "User:" : "AI:"}
            </span>
            {m.parts.map((p, i) => (p.type === "text" ? <span key={i}>{p.text}</span> : null))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          className="text-xs px-2 py-1 rounded border"
          disabled={!(status === "submitted" || status === "streaming")}
          onClick={() => stop()}
        >
          Stop
        </button>
      </div>
    </div>
  )
}

function ApiKeyDialog({ onSave }: { onSave: (key: string) => void }) {
  const [value, setValue] = useState("")
  const save = () => {
    const k = value.trim()
    if (!k) return
    localStorage.setItem("openrouter_key", k)
    onSave(k)
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-md bg-white text-black dark:bg-neutral-900 dark:text-white rounded-lg shadow p-4 space-y-3">
        <h2 className="text-base font-semibold">Enter your OpenRouter API key</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Your key is stored only in your browser (localStorage) and sent with requests from this page.
        </p>
        <input
          autoFocus
          type="password"
          className="w-full border rounded px-3 py-2 bg-white text-black dark:bg-neutral-800 dark:text-white"
          placeholder="sk-or-v1-..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button className="border rounded px-3 py-2" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}

export default function Arena() {
  const [apiKey, setApiKey] = useState<string | null>(null)
  useEffect(() => {
    setApiKey(localStorage.getItem("openrouter_key"))
  }, [])

  const { models, loading } = useModels(apiKey)

  const defaultA = "anthropic/claude-3.7-sonnet"
  const defaultB = "openai/gpt-4o"

  const [modelA, setModelA] = useState(defaultA)
  const [modelB, setModelB] = useState(defaultB)

  useEffect(() => {
    if (!loading && models.length) {
      if (!models.find((m) => m.id === modelA)) setModelA(models[0].id)
      if (!models.find((m) => m.id === modelB)) setModelB(models[Math.min(1, models.length - 1)].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, models.length])

  const chatA = useChat({
    headers: apiKey ? { "x-openrouter-key": apiKey } : undefined,
  })
  const chatB = useChat({
    headers: apiKey ? { "x-openrouter-key": apiKey } : undefined,
  })

  const [input, setInput] = useState("")

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || !apiKey) return
    chatA.sendMessage({ text }, { body: { modelId: modelA }, headers: { "x-openrouter-key": apiKey } })
    chatB.sendMessage({ text }, { body: { modelId: modelB }, headers: { "x-openrouter-key": apiKey } })
    setInput("")
  }

  return (
    <div className="min-h-screen p-6 space-y-4 bg-white text-black dark:bg-black dark:text-white">
      {!apiKey && <ApiKeyDialog onSave={setApiKey} />}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">LLM Arena</h1>
        <div className="flex items-center gap-3">
          <ModelSelect label="Model A" value={modelA} onChange={setModelA} options={models} />
          <ModelSelect label="Model B" value={modelB} onChange={setModelB} options={models} />
        </div>
      </div>

      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          className="flex-1 border rounded px-3 py-2 bg-white text-black dark:bg-neutral-900 dark:text-white"
        />
        <button className="border rounded px-3 py-2">Send</button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Panel title="Response A" modelId={modelA} messages={chatA.messages} status={chatA.status} stop={chatA.stop} />
        </div>
        <div>
          <Panel title="Response B" modelId={modelB} messages={chatB.messages} status={chatB.status} stop={chatB.stop} />
        </div>
      </div>
    </div>
  )
}
