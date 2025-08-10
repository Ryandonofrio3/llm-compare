# LLM Arena

Next.js + Bun + TypeScript app to compare two LLMs side by side using AI SDK v5 and OpenRouter.

## Setup

1. Create `.env.local`:

```
OPENROUTER_API_KEY=your_key
APP_URL=http://localhost:3000
APP_NAME=LLM Arena
```

2. Install deps:

```
bun install
```

3. Run dev:

```
bun run dev
```

Open `http://localhost:3000`.

## Notes
- Model list is fetched from `/api/models` (server proxies OpenRouter).
- Chats stream via `/api/chat` using the selected `modelId`.
