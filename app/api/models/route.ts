import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const incomingAuth = req.headers.get('authorization')
  const headerKey = req.headers.get('x-openrouter-key')
  const apiKey = headerKey || (incomingAuth?.startsWith('Bearer ') ? incomingAuth.slice(7) : undefined)

  if (!apiKey) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 401 })
  }

  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.APP_URL ?? 'http://localhost:3000',
      'X-Title': process.env.APP_NAME ?? 'LLM Arena',
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 })
  }

  const data = await res.json()
  return NextResponse.json(data)
} 