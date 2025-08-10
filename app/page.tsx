"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import Fuse from "fuse.js"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

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
      <Label className="text-sm mb-1">{label}</Label>
      <div className="relative">
        <Button
          variant="outline"
          className="w-full justify-start text-left font-normal"
          onClick={() => {
            setOpen((o) => !o)
            setTimeout(() => inputRef.current?.focus(), 0)
          }}
        >
          {selectedLabel}
        </Button>
        {open && (
          <Card className="absolute z-50 mt-1 w-full shadow-lg">
            <CardContent className="p-2">
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
                onKeyDown={onKeyDown}
                placeholder={placeholder || "Search models by name or id..."}
                className="mb-2"
              />
              <Separator className="mb-2" />
              <div className="max-h-72 overflow-auto">
                {results.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No results</div>
                )}
                {results.map((m, i) => (
                  <div
                    key={m.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(m)}
                    onMouseEnter={() => setActive(i)}
                    className={`px-3 py-2 text-sm cursor-pointer rounded hover:bg-accent ${
                      i === active ? "bg-accent" : ""
                    }`}
                  >
                    <div className="font-medium">{m.name || m.id}</div>
                    <div className="text-xs text-muted-foreground">{m.id}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
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
    <Card className="h-[60vh] flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{title}</CardTitle>
          <Badge variant="outline" className="text-xs">{modelId}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto space-y-2 text-sm pt-0">
        {messages.map((m) => (
          <div key={m.id} className="whitespace-pre-wrap">
            <Badge variant={m.role === "user" ? "default" : "secondary"} className="text-xs mr-2">
              {m.role === "user" ? "User" : "AI"}
            </Badge>
            {m.parts.map((p, i) => (p.type === "text" ? <span key={i}>{p.text}</span> : null))}
          </div>
        ))}
      </CardContent>
      <div className="p-4 pt-0">
        <Button
          variant="outline"
          size="sm"
          disabled={!(status === "submitted" || status === "streaming")}
          onClick={() => stop()}
        >
          Stop
        </Button>
      </div>
    </Card>
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
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Enter your OpenRouter API key</CardTitle>
          <CardDescription>
            Your key is stored only in your browser (localStorage) and sent with requests from this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-key">API Key</Label>
            <Input
              id="api-key"
              autoFocus
              type="password"
              placeholder="sk-or-v1-..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={save}>Save</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatsDisplay({ 
  votes, 
  models, 
  onReset,
  onExport
}: { 
  votes: ArenaVote[]
  models: OpenRouterModel[]
  onReset: () => void
  onExport: () => void
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
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            View Stats (0 votes)
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No votes yet</DialogTitle>
            <DialogDescription>
              Start comparing models to see your preference statistics here.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
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
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
                   <div className="text-3xl font-bold">{
                     new Set([
                       ...votes.map(v => v.modelAId),
                       ...votes.map(v => v.modelBId)
                     ]).size
                   }</div>
                 </CardContent>
               </Card>
               
               <Card>
                 <CardHeader>
                   <CardTitle>Top Model</CardTitle>
                 </CardHeader>
                 <CardContent>
                   {sortedCounts.length > 0 ? (
                     <div>
                       <div className="font-semibold">{sortedCounts[0].name}</div>
                       <div className="text-sm text-muted-foreground">
                         {sortedCounts[0].count} wins ({sortedCounts[0].winRate}%)
                       </div>
                     </div>
                   ) : (
                     <div className="text-sm text-muted-foreground">No votes yet</div>
                   )}
                 </CardContent>
               </Card>
             </div>

             <Card>
               <CardHeader>
                 <CardTitle>🏆 Personal Leaderboard</CardTitle>
                 <CardDescription>
                   Your preferred models ranked by wins
                 </CardDescription>
               </CardHeader>
               <CardContent>
                 {sortedCounts.length === 0 ? (
                   <div className="text-center py-8 text-muted-foreground">
                     No data yet. Start comparing models to build your personal leaderboard!
                   </div>
                 ) : (
                   <div className="space-y-2">
                     {sortedCounts.map((entry, index) => (
                       <div key={entry.modelId} className="flex items-center justify-between p-3 border rounded-lg">
                         <div className="flex items-center gap-3">
                           <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                             {index + 1}
                           </div>
                           <div>
                             <div className="font-medium">{entry.name}</div>
                             <div className="text-xs text-muted-foreground">{entry.modelId}</div>
                           </div>
                         </div>
                         <div className="text-right">
                           <div className="font-semibold">{entry.count} wins</div>
                           <div className="text-xs text-muted-foreground">{entry.winRate}% preference</div>
                         </div>
                       </div>
                     ))}
                   </div>
                 )}
               </CardContent>
             </Card>

             <Card className="mt-6">
               <CardHeader>
                 <CardTitle>Actions</CardTitle>
                 <CardDescription>
                   Manage your arena data
                 </CardDescription>
               </CardHeader>
                                <CardContent className="space-y-2">
                   <div className="flex gap-2">
                     <Button variant="outline" onClick={onExport} size="sm" disabled={votes.length === 0}>
                       📊 Export Stats
                     </Button>
                     <Button variant="destructive" onClick={onReset} size="sm">
                       Reset All Data
                     </Button>
                   </div>
                 </CardContent>
             </Card>
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

  const exportStats = () => {
    const exportData = {
      votes,
      exportDate: new Date().toISOString(),
      summary: {
        totalVotes: votes.length,
        modelsTotal: new Set([...votes.map(v => v.modelAId), ...votes.map(v => v.modelBId)]).size,
        topModels: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
      }
    }
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `llm-arena-stats-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
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
        {votes.length > 0 && (
          <>
            <span className="text-muted-foreground">Personal Leaderboard:</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([id, c], index) => {
                  const m = models.find((mm) => mm.id === id)
                  const label = m?.name ? `${m.name}` : id
                  return (
                    <Badge key={id} variant={index === 0 ? "default" : "outline"}>
                      {index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"} {label} ({c})
                    </Badge>
                  )
                })}
            </div>
          </>
        )}
        <div className="ml-auto flex gap-2">
          <StatsDisplay votes={votes} models={models} onReset={resetStats} onExport={exportStats} />
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
