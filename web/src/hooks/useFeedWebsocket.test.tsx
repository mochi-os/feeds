// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useFeedWebsocket } from './useFeedWebsocket'

const { subscribe, refresh } = vi.hoisted(() => ({
  subscribe: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('@mochi/web', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ isInitialized: true, token: 'token' }),
  entityWebsocketManager: { subscribe },
}))
vi.mock('@/stores/feeds-store', () => ({
  useFeedsStore: { getState: () => ({ refresh, adjustUnread: vi.fn() }) },
}))

type Handler = (event: Record<string, unknown>) => void

function mount(onGone: (reason: 'removed' | 'deleted') => void) {
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  renderHook(
    () => useFeedWebsocket('fp1', 'me', undefined, undefined, onGone),
    { wrapper }
  )
  expect(subscribe).toHaveBeenCalledWith('fp1', expect.any(Function))
  return subscribe.mock.calls[0][1] as Handler
}

beforeEach(() => {
  vi.clearAllMocks()
  subscribe.mockReturnValue(() => {})
})

describe('useFeedWebsocket gone events', () => {
  it('reports a removal and refreshes the sidebar', () => {
    const onGone = vi.fn()
    const handle = mount(onGone)

    handle({ type: 'feed/removed', feed: 'feed-1' })

    expect(onGone).toHaveBeenCalledWith('removed')
    expect(refresh).toHaveBeenCalled()
  })

  it('reports a deletion', () => {
    const onGone = vi.fn()
    const handle = mount(onGone)

    handle({ type: 'feed/deleted', feed: 'feed-1' })

    expect(onGone).toHaveBeenCalledWith('deleted')
  })

  it('leaves ordinary events alone', () => {
    const onGone = vi.fn()
    const handle = mount(onGone)

    handle({ type: 'post/edit', feed: 'feed-1', post: 'p1', sender: 'other' })

    expect(onGone).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
})
