"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import Fuse from "fuse.js"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

type OpenRouterModel = {
  id: string
  name?: string
  pricing?: Record<string, string>
}

type ModelsResponse = {
  data: OpenRouterModel[]
}

// Voting types and helpers
// Tracks a single A/B vote result for a prompt
type ArenaVote = {
  id: string
  prompt: string
  modelAId: string
  modelBId: string
  winnerModelId: string
  timestamp: number
}

const VOTES_KEY = "arena_votes"

function loadVotesFromLocalStorage(): ArenaVote[] {
  try {
    const raw = localStorage.getItem(VOTES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

function saveVotesToLocalStorage(votes: ArenaVote[]) {
  try {
    localStorage.setItem(VOTES_KEY, JSON.stringify(votes))
  } catch {
    // ignore write errors
  }
}

function aggregateWinnerCounts(votes: ArenaVote[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const v of votes) {
    counts[v.winnerModelId] = (counts[v.winnerModelId] || 0) + 1
  }
  return counts
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

function ModelSearch({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: OpenRouterModel[]
  placeholder?: string
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const fuse = useMemo(() => {
    return new Fuse(options, {
      keys: [
        { name: "name", weight: 0.6 },
        { name: "id", weight: 0.4 },
      ],
      threshold: 0.35,
      ignoreLocation: true,
      includeScore: true,
    })
  }, [options])

  const results = useMemo(() => {
    if (!query) {
      // Show some defaults (top 20) when no query
      return options.slice(0, 20)
    }
    return fuse.search(query).slice(0, 20).map((r) => r.item)
  }, [fuse, options, query])

  useEffect(() => {
    if (results.length === 0) {
      if (active !== 0) setActive(0)
      return
    }
    if (active >= results.length) {
      setActive(results.length - 1)
    } else if (active < 0) {
      setActive(0)
    }
  }, [active, results.length])

  const pick = (m: OpenRouterModel) => {
    onChange(m.id)
    setQuery("")
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (results[active]) pick(results[active])
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  const selectedLabel = useMemo(() => {
    const m = options.find((o) => o.id === value)
    return m ? (m.name ? `${m.name} (${m.id})` : m.id) : value
  }, [options, value])

  return (
    <div className="w-full max-w-md">
      <label className="block text-sm text-neutral-700 dark:text-neutral-200 mb-1">{label}</label>
      <div className="relative">
        <button
          type="button"
          className="w-full border rounded px-3 py-2 text-left bg-white text-black dark:bg-neutral-900 dark:text-white"
          onClick={() => {
            setOpen((o) => !o)
            setTimeout(() => inputRef.current?.focus(), 0)
          }}
        >
          {selectedLabel}
        </button>
        {open && (
          <div className="absolute z-50 mt-1 w-full border rounded bg-white text-black dark:bg-neutral-900 dark:text-white shadow">
            <div className="p-2">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
                onKeyDown={onKeyDown}
                placeholder={placeholder || "Search models by name or id..."}
                className="w-full border rounded px-3 py-2 bg-white text-black dark:bg-neutral-800 dark:text-white"
              />
            </div>
            <ul className="max-h-72 overflow-auto">
              {results.length === 0 && (
                <li className="px-3 py-2 text-sm text-neutral-500">No results</li>
              )}
              {results.map((m, i) => (
                <li
                  key={m.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(m)}
                  onMouseEnter={() => setActive(i)}
                  className={`px-3 py-2 text-sm cursor-pointer ${
                    i === active ? "bg-neutral-100 dark:bg-neutral-800" : ""
                  }`}
                >
                  <div className="font-medium">{m.name || m.id}</div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">{m.id}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
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

function StatsDisplay({ 
  votes, 
  models, 
  onReset 
}: { 
  votes: ArenaVote[]
  models: OpenRouterModel[]
  onReset: () => void 
}) {
  const counts = useMemo(() => aggregateWinnerCounts(votes), [votes])
  
  const sortedCounts = useMemo(() => {
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([modelId, count]) => {
        const model = models.find(m => m.id === modelId)
        return {
          modelId,
          count,
          name: model?.name || modelId,
          winRate: votes.length > 0 ? ((count / votes.length) * 100).toFixed(1) : "0"
        }
      })
  }, [counts, models, votes.length])

  const recentVotes = useMemo(() => {
    return [...votes]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10)
      .map(vote => {
        const winnerModel = models.find(m => m.id === vote.winnerModelId)
        const loserModelId = vote.winnerModelId === vote.modelAId ? vote.modelBId : vote.modelAId
        const loserModel = models.find(m => m.id === loserModelId)
        return {
          ...vote,
          winnerName: winnerModel?.name || vote.winnerModelId,
          loserName: loserModel?.name || loserModelId
        }
      })
  }, [votes, models])

  if (votes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No votes yet</CardTitle>
          <CardDescription>
            Start comparing models to see your preference statistics here.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          View Stats ({votes.length} votes)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Arena Statistics</DialogTitle>
          <DialogDescription>
            Your model preference data from {votes.length} comparisons
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="rankings" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="rankings">Rankings</TabsTrigger>
            <TabsTrigger value="history">Vote History</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>
          
          <TabsContent value="rankings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Model Rankings</CardTitle>
                <CardDescription>
                  Based on your {votes.length} votes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {sortedCounts.map((entry, index) => (
                    <div key={entry.modelId} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center gap-3">
                        <Badge variant={index === 0 ? "default" : "secondary"}>
                          #{index + 1}
                        </Badge>
                        <div>
                          <div className="font-medium">{entry.name}</div>
                          <div className="text-xs text-muted-foreground">{entry.modelId}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{entry.count} wins</div>
                        <div className="text-xs text-muted-foreground">{entry.winRate}% win rate</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Votes</CardTitle>
                <CardDescription>
                  Your last 10 model comparisons
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentVotes.map((vote) => (
                    <div key={vote.id} className="border rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline">
                          {vote.winnerName} won
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(vote.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground mb-1">
                        "{vote.prompt.slice(0, 100)}{vote.prompt.length > 100 ? "..." : ""}"
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {vote.winnerName} vs {vote.loserName}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="insights" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Total Comparisons</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{votes.length}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Models Tested</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{Object.keys(counts).length}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Top Model</CardTitle>
                </CardHeader>
                <CardContent>
                  {sortedCounts.length > 0 && (
                    <div>
                      <div className="font-semibold">{sortedCounts[0].name}</div>
                      <div className="text-sm text-muted-foreground">
                        {sortedCounts[0].count} wins ({sortedCounts[0].winRate}%)
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button variant="destructive" onClick={onReset} size="sm">
                    Reset All Data
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
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

  const chatA = useChat()
  const chatB = useChat()

  const [input, setInput] = useState("")

  // Votes and round context
  const [votes, setVotes] = useState<ArenaVote[]>([])
  const [hasVoted, setHasVoted] = useState(false)
  const [currentRound, setCurrentRound] = useState<{
    modelAId: string
    modelBId: string
    prompt: string
    timestamp: number
  } | null>(null)

  useEffect(() => {
    // Load persisted votes on mount
    const loaded = loadVotesFromLocalStorage()
    setVotes(loaded)
  }, [])

  useEffect(() => {
    // Persist votes whenever they change
    saveVotesToLocalStorage(votes)
  }, [votes])

  const counts = useMemo(() => aggregateWinnerCounts(votes), [votes])

  const bothReady = useMemo(() => {
    return chatA.status === "ready" && chatB.status === "ready" && !!currentRound && 
           chatA.messages.length > 0 && chatB.messages.length > 0
  }, [chatA.status, chatB.status, currentRound, chatA.messages.length, chatB.messages.length])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || !apiKey) return

    // Start fresh for each submission
    chatA.setMessages([])
    chatB.setMessages([])

    // Capture the round context so votes are tied to the right models
    const round = {
      modelAId: modelA,
      modelBId: modelB,
      prompt: text,
      timestamp: Date.now(),
    }
    setCurrentRound(round)
    setHasVoted(false)

    chatA.sendMessage({ text }, { body: { modelId: modelA }, headers: { "x-openrouter-key": apiKey } })
    chatB.sendMessage({ text }, { body: { modelId: modelB }, headers: { "x-openrouter-key": apiKey } })

    // Clear input box
    setInput("")
  }

  const handleVote = (winner: "A" | "B") => {
    if (!currentRound) return
    const winnerModelId = winner === "A" ? currentRound.modelAId : currentRound.modelBId
    const vote: ArenaVote = {
      id: `${currentRound.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      prompt: currentRound.prompt,
      modelAId: currentRound.modelAId,
      modelBId: currentRound.modelBId,
      winnerModelId,
      timestamp: Date.now(),
    }
    setVotes((prev) => [...prev, vote])
    setHasVoted(true)
  }

  const resetStats = () => {
    setVotes([])
    setHasVoted(false)
    setCurrentRound(null)
    try {
      localStorage.removeItem(VOTES_KEY)
    } catch {
      // ignore
    }
  }

  return (
    <div className="min-h-screen p-6 space-y-4 bg-white text-black dark:bg-black dark:text-white">
      {!apiKey && <ApiKeyDialog onSave={setApiKey} />}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">LLM Arena</h1>
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full">
          <ModelSearch label="Model A" value={modelA} onChange={setModelA} options={models} />
          <ModelSearch label="Model B" value={modelB} onChange={setModelB} options={models} />
        </div>
      </div>

      {/* Stats summary with detailed view */}
      <div className="flex flex-wrap items-center gap-2 text-sm">

        <div className="ml-auto flex gap-2">
          <StatsDisplay votes={votes} models={models} onReset={resetStats} />
        </div>
      </div>

      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          className="flex-1 border rounded px-3 py-2 bg-white text-black dark:bg-neutral-900 dark:text-white"
        />
        <Button type="submit">Send</Button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Panel title="Response A" modelId={modelA} messages={chatA.messages} status={chatA.status} stop={chatA.stop} />
        </div>
        <div>
          <Panel title="Response B" modelId={modelB} messages={chatB.messages} status={chatB.status} stop={chatB.stop} />
        </div>
      </div>

      {/* Voting controls - only show after both responses are complete */}
      {bothReady && (
        <Card className="p-4">
          <div className="flex items-center justify-center gap-4">
            <span className="text-sm font-medium">Which response do you prefer?</span>
            <Button
              variant="outline"
              disabled={hasVoted}
              onClick={() => handleVote("A")}
            >
              Prefer A
            </Button>
            <Button
              variant="outline"
              disabled={hasVoted}
              onClick={() => handleVote("B")}
            >
              Prefer B
            </Button>
            {hasVoted && currentRound && (
              <span className="text-xs text-muted-foreground">
                ✓ Vote recorded for: "{currentRound.prompt.slice(0, 40)}{currentRound.prompt.length > 40 ? "…" : ""}"
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
