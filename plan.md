# LLM Arena Plan (Bun + TypeScript + shadcn/ui + AI SDK v5 + OpenRouter)

## Goals
- Build a single-page "LLM Arena" where a user asks one question and streams two side-by-side answers from two selectable models.
- Models are user-selectable via a searchable model registry browser powered by OpenRouter.
- Use AI SDK v5 for streaming and React UI; integrate OpenRouter for both model list and completions.
- Stack: Bun + React (Vite) + TypeScript + shadcn/ui (all components) + Hono for the API route.

## Key Findings (from docs)
- **AI SDK v5**: `streamText` for streaming, `useChat` for UI message streaming and per-request body/headers; supports tool calls and multi-step, but we only need text streaming initially. See AI SDK docs: Chatbot/useChat and streamText.
  - Reference: [AI SDK UI useChat](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat), [Chatbot guide](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot), [streamText reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text)
- **AI SDK + OpenRouter provider**: Dedicated provider `@openrouter/ai-sdk-provider` with `createOpenRouter()` returning `.chat(modelId)`. Model IDs are like `anthropic/claude-3.7-sonnet`, `openai/gpt-4o`, etc.
  - Reference: [AI SDK OpenRouter provider](https://ai-sdk.dev/providers/community-providers/openrouter)
- **OpenRouter API**: 
  - Models: `GET https://openrouter.ai/api/v1/models` returns `data` array with `id`, `name`, `pricing`, `supported_parameters`, `context_length`, etc. Use to populate search/select.
    - Reference: [List available models](https://openrouter.ai/docs/api-reference/list-available-models)
  - Chat completions: `POST https://openrouter.ai/api/v1/chat/completions` (OpenAI-compatible), set `model`, `messages`, and `stream: true` for SSE streaming. Optional headers `HTTP-Referer` and `X-Title` help attribution.
    - Reference: [Chat completion](https://openrouter.ai/docs/api-reference/chat-completion), [Streaming](https://openrouter.ai/docs/api-reference/streaming), [API Overview](https://openrouter.docs.buildwithfern.com/docs/api-reference/overview)
  - Endpoints per model: `GET /api/v1/models/:author/:slug/endpoints` if we need detailed provider/pricing per model for future features.
    - Reference: [List endpoints for a model](https://openrouter.ai/docs/api-reference/list-endpoints-for-a-model?explorer=true)
- **Attribution/headers**: Set optional `HTTP-Referer` (site URL) and `X-Title` (app title) on server-side requests.
  - Reference: [Auth/API headers](https://openrouter.ai/docs/api-keys)
- **shadcn/ui CLI**: Initialize once, then add components. For "all components", either use interactive select-all (press `A`) or pass a long list in one command.
  - Reference: [shadcn CLI init/add](https://ui.aceternity.com/docs/cli) and community notes; one-liner example for Bun below.
- **Server choice**: Hono works well with Bun and AI SDK, and AI SDK provides helpers to stream UIMessage streams.
  - Reference: [AI SDK + Hono](https://ai-sdk.dev/cookbook/api-servers/hono)

## Architecture
- Client: Vite + React SPA using `@ai-sdk/react` `useChat` twice (one per model) or once with two panels and separate chat IDs. We’ll pass `modelId` via request body to the API.
- UI:
  - Top bar: Model selector for Model A and Model B (Combobox with search over OpenRouter registry).
  - Prompt input: shared text input + submit triggers both requests concurrently.
  - Results: two columns streaming responses independently.
  - Extras: token usage footer (optional), stop/regenerate per column.
- Server: Hono endpoint `POST /api/chat` that accepts `{ messages, modelId }` and returns `result.toUIMessageStreamResponse()` from AI SDK `streamText` using OpenRouter provider: `openrouter.chat(modelId)`.
- Model registry service: `GET /api/models` (server) proxies OpenRouter `GET /api/v1/models` with server key; client queries it for search and selection.
- Secrets: `OPENROUTER_API_KEY` in `.env` (server-only). Never expose on client.

## Data Flow
1. On load, client fetches `/api/models` → display searchable combobox with popular/recent models.
2. User selects Model A and Model B (defaults can be sane picks e.g., `anthropic/claude-3.7-sonnet` and `openai/gpt-4o`).
3. User submits a question → client fires two `useChat` requests to `/api/chat`, each with `body: { modelId: '...' }` and the same messages.
4. Server streams both responses (SSE) back using AI SDK’s `toUIMessageStreamResponse`. Client renders both streams concurrently.

## Environment & Config
- `.env` (local):
  - `OPENROUTER_API_KEY=...`
  - Optional attribution: `APP_URL=https://localhost:5173` (dev) and `APP_NAME=LLM Arena` to set headers.
- Server attaches headers to OpenRouter calls:
  - `Authorization: Bearer ${OPENROUTER_API_KEY}`
  - Optional: `HTTP-Referer: ${APP_URL}`, `X-Title: ${APP_NAME}`

## Dependencies
- Core: `ai` `@ai-sdk/react` `zod`
- OpenRouter provider: `@openrouter/ai-sdk-provider`
- Server: `hono` (and either `@hono/node-server` or Bun runtime)
- UI: `shadcn/ui` via CLI, `@radix-ui/*`, `lucide-react`, TailwindCSS

Install (with Bun):

```bash
bun add ai @ai-sdk/react zod @openrouter/ai-sdk-provider hono
# dev tools if needed
bun add -d typescript tsx @types/node
```

Tailwind/shadcn init will add more packages automatically.

## shadcn/ui Setup (add ALL components)
- Initialize:
```bash
bunx --bun shadcn@latest init
# choose: style New York, base color Zinc, use CSS vars (yes)
```
- Add all components (option 1: interactive):
```bash
bunx --bun shadcn@latest add
# press A to toggle all, then Enter
```
- Add all components (option 2: explicit list one-liner):
```bash
bunx --bun shadcn@latest add accordion alert alert-dialog aspect-ratio avatar badge breadcrumb button calendar card carousel chart checkbox collapsible command context-menu data-table date-picker dialog drawer dropdown-menu form hover-card input input-otp label menubar navigation-menu number-field pagination pin-input popover progress radio-group range-calendar resizable scroll-area select separator sheet sidebar skeleton slider sonner switch table tabs tags-input textarea toast toggle toggle-group tooltip
```
Note: Component names occasionally change; if any fail, re-run for the missing ones.

## Server Implementation (Hono + AI SDK v5 + OpenRouter)
- Create `src/server.ts`:

```ts
import { Hono } from 'hono'
import { streamText, convertToModelMessages, type UIMessage } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'

const app = new Hono()

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
  headers: {
    'HTTP-Referer': process.env.APP_URL ?? 'http://localhost:5173',
    'X-Title': process.env.APP_NAME ?? 'LLM Arena',
  },
})

app.post('/api/chat', async (c) => {
  const { messages, modelId }: { messages: UIMessage[]; modelId: string } = await c.req.json()

  const result = streamText({
    model: openrouter.chat(modelId),
    messages: convertToModelMessages(messages),
  })

  // AI SDK response includes proper stream headers
  return result.toUIMessageStreamResponse()
})

app.get('/api/models', async (c) => {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.APP_URL ?? 'http://localhost:5173',
      'X-Title': process.env.APP_NAME ?? 'LLM Arena',
    },
  })
  if (!res.ok) return c.text('Failed to fetch models', 500)
  const json = await res.json()
  return c.json(json)
})

export default app
```

- Run with Bun (dev):
```bash
# package.json scripts example
# "dev:server": "bun --hot src/dev-server.ts"
```
- Example `src/dev-server.ts` using Bun serve:
```ts
import app from './server'
import { serve } from 'bun'

serve({
  port: 8787,
  fetch: app.fetch,
})
console.log('API listening on http://localhost:8787')
```
- In Vite, proxy `/api/*` to `http://localhost:8787` during dev.

## Client Implementation (SPA)
- Pages/components:
  - `ModelPicker.tsx` (combobox) for Model A/B using `/api/models` results; store in parent state.
  - `Arena.tsx` containing two panels:
    - Each panel uses `useChat` with `DefaultChatTransport` pointing to `/api/chat`.
    - Submit once; send two requests by calling `sendMessage` for each panel with the same text but different `body: { modelId }`.

- Example panel hook usage:
```ts
import { DefaultChatTransport, useChat } from '@ai-sdk/react'

function useModelChat(modelId: string) {
  return useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
    // message send will include modelId per-request
  })
}
```
- Sending from parent:
```ts
const a = useModelChat(modelA)
const b = useModelChat(modelB)

async function onSubmit(text: string) {
  a.sendMessage({ text }, { body: { modelId: modelA } })
  b.sendMessage({ text }, { body: { modelId: modelB } })
}
```
- Render messages with `message.parts` per AI SDK v5 guidance.

## Vite Dev Proxy
- `vite.config.ts` snippet:
```ts
server: {
  proxy: {
    '/api': 'http://localhost:8787',
  },
}
```

## Defaults & Model IDs
- Good defaults (if user hasn’t selected):
  - `anthropic/claude-3.7-sonnet`
  - `openai/gpt-4o`
- IDs are as listed in OpenRouter models API. Avoid provider-specific extras unless needed (e.g. `:thinking` variants).

## Error Handling & Edge Cases
- Handle 402 from OpenRouter (insufficient credits) → show a friendly error toast.
- Free `:free` models have per-minute and per-day limits; gracefully degrade.
- If a selected model becomes unavailable, surface a retry with a hint to pick another model.
- Add a Stop button per stream using `stop()` from `useChat`.

## Security
- Keep `OPENROUTER_API_KEY` server-side only. Never expose to client.
- Validate `modelId` server-side against a cached whitelist from `/api/models` if you want to lock down to supported IDs.

## Telemetry & Usage (optional)
- Read `usage` from AI SDK result on server and forward via `messageMetadata` to show tokens.
- OpenRouter returns usage at end of stream; AI SDK can surface it.

## Styling & UI (shadcn components to leverage)
- Layout: `sidebar`, `card`, `tabs` (optional for history), `textarea` input, `button`, `badge` for model chips, `combobox/command` for model search, `toast` for errors.
- Dark mode via Tailwind config from shadcn init.

## Implementation Steps
1. Ensure project is Bun + Vite + TS. If not present, scaffold a Vite React TS app.
2. Install deps: `bun add ai @ai-sdk/react zod @openrouter/ai-sdk-provider hono`.
3. Create `.env` with `OPENROUTER_API_KEY`, optional `APP_URL`, `APP_NAME`.
4. Initialize shadcn: `bunx --bun shadcn@latest init`.
5. Add all shadcn components (interactive or one-liner).
6. Implement server (`src/server.ts`, `src/dev-server.ts`), set Vite proxy.
7. Implement `ModelPicker` and `Arena` with two `useChat` instances; wire submit.
8. Add basic error states, stop buttons, and minimal token usage footer (optional).
9. Run dev servers: `bun run dev` (Vite) and `bun run dev:server` (API) or combine via one process manager.

## Future Enhancements
- Persist conversations per model (localStorage or lightweight backend store).
- Show pricing/context info from model registry.
- Add tool-calling demos (calculator/weather) using AI SDK tools.
- Add "Compare diff" view to highlight differences between outputs.
- Allow presets/library of prompts and system instructions.

## Quick Commands (recap)
```bash
# deps
bun add ai @ai-sdk/react zod @openrouter/ai-sdk-provider hono

# shadcn init
bunx --bun shadcn@latest init

# add all components (interactive)
bunx --bun shadcn@latest add  # then press A, Enter

# add all components (explicit)
bunx --bun shadcn@latest add accordion alert alert-dialog aspect-ratio avatar badge breadcrumb button calendar card carousel chart checkbox collapsible command context-menu data-table date-picker dialog drawer dropdown-menu form hover-card input input-otp label menubar navigation-menu number-field pagination pin-input popover progress radio-group range-calendar resizable scroll-area select separator sheet sidebar skeleton slider sonner switch table tabs tags-input textarea toast toggle toggle-group tooltip
```

## References
- AI SDK: [useChat](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat), [Chatbot](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot), [streamText](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text), [Hono cookbook](https://ai-sdk.dev/cookbook/api-servers/hono)
- OpenRouter: [Models API](https://openrouter.ai/docs/api-reference/list-available-models), [Chat completions](https://openrouter.ai/docs/api-reference/chat-completion), [Streaming](https://openrouter.ai/docs/api-reference/streaming), [Quickstart](https://openrouter.ai/docs/quick-start)
- AI SDK OpenRouter provider: [@openrouter/ai-sdk-provider](https://ai-sdk.dev/providers/community-providers/openrouter)
- shadcn CLI: [Init/Add](https://ui.aceternity.com/docs/cli) 