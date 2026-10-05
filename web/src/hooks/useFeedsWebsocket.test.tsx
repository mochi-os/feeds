// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFeedsWebsocket } from './useFeedsWebsocket'

const { subscribe, applyFrame } = vi.hoisted(() => ({
  subscribe: vi.fn(),
  applyFrame: vi.fn(),
}))

vi.mock('@mochi/web', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ isInitialized: true, token: 'token' }),
  entityWebsocketManager: { subscribe },
}))
vi.mock('@/stores/feeds-store', () => ({
  useFeedsStore: { getState: () => ({ adjustUnread: vi.fn() }) },
}))
vi.mock('@/lib/patch', () => ({ applyFrame }))

type Handler = (event: Record<string, unknown>) => void

/** Mounts the hook over one feed and gives its frame handler, with every reload of the post lists it asks for. */
function listen() {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  renderHook(() => useFeedsWebsocket(['fp1'], 'me'), { wrapper })
  const handle = subscribe.mock.calls[0][1] as Handler
  const reloads = () =>
    invalidate.mock.calls.filter(
      ([filters]) =>
        (filters?.queryKey as string[] | undefined)?.[0] === 'posts'
    ).length
  return { handle, client, reloads }
}

beforeEach(() => {
  vi.clearAllMocks()
  subscribe.mockReturnValue(() => {})
})

describe('useFeedsWebsocket frames about posts', () => {
  it('changes the one post and does not reload the list', () => {
    applyFrame.mockReturnValue(true)
    const { handle, client, reloads } = listen()
    const frame = {
      type: 'comment/create',
      feed: 'feed-1',
      post: 'p1',
      sender: 'other',
    }

    handle(frame)

    expect(applyFrame).toHaveBeenCalledWith(client, frame)
    expect(reloads()).toBe(0)
  })

  it('reloads the list for a frame that is not about one post', () => {
    applyFrame.mockReturnValue(false)
    const { handle, reloads } = listen()

    handle({ type: 'feed/update', feed: 'feed-1', sender: 'other' })

    expect(reloads()).toBe(1)
  })
})
