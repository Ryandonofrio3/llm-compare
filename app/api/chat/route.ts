import { NextResponse } from 'next/server'
import { streamText, convertToModelMessages, type UIMessage } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const incomingAuth = req.headers.get('authorization')
  const headerKey = req.headers.get('x-openrouter-key')
  const apiKey = headerKey || (incomingAuth?.startsWith('Bearer ') ? incomingAuth.slice(7) : undefined)
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 401 })
  }

  const { messages, modelId }: { messages: UIMessage[]; modelId: string } = await req.json()

  const openrouter = createOpenRouter({
    apiKey,
    headers: {
      'HTTP-Referer': process.env.APP_URL ?? 'http://localhost:3000',
      'X-Title': process.env.APP_NAME ?? 'LLM Arena',
    },
  })

  const result = streamText({
    model: openrouter.chat(modelId),
    messages: convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse()
} 