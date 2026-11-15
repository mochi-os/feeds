// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useFeedWebsocket } from './useFeedWebsocket'

const { subscribe, refresh, applyFrame, auth } = vi.hoisted(() => ({
  subscribe: vi.fn(),
  refresh: vi.fn(),
  applyFrame: vi.fn(),
  auth: { isInitialized: true, isAuthenticated: true, token: 'token' },
}))

vi.mock('@mochi/web', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector(auth),
  entityWebsocketManager: { subscribe },
}))
vi.mock('@/stores/feeds-store', () => ({
  useFeedsStore: { getState: () => ({ refresh, adjustUnread: vi.fn() }) },
}))
vi.mock('@/lib/patch', () => ({ applyFrame }))

type Handler = (event: Record<string, unknown>) => void

/** Mounts the hook and gives its frame handler, with every reload of the post lists it asks for. */
function listen() {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  renderHook(() => useFeedWebsocket('fp1', 'me'), { wrapper })
  const handle = subscribe.mock.calls[0][1] as Handler
  const reloads = () =>
    invalidate.mock.calls.filter(
      ([filters]) =>
        (filters?.queryKey as string[] | undefined)?.[0] === 'posts'
    ).length
  return { handle, client, reloads }
}

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
  Object.assign(auth, { isAuthenticated: true, token: 'token' })
})

// Core refuses a socket with no signed-in user, and a refused one is retried
// for as long as the page is open: about 120 refusals an hour for each
// anonymous reader of a public feed.
describe('useFeedWebsocket for a reader who is not signed in', () => {
  function anonymous() {
    Object.assign(auth, { isAuthenticated: false, token: '' })
    const client = new QueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    return renderHook(() => useFeedWebsocket('fp1'), { wrapper })
  }

  it('opens no socket', () => {
    anonymous()
    expect(subscribe).not.toHaveBeenCalled()
  })

  it('opens it once the reader signs in', () => {
    const { rerender } = anonymous()
    Object.assign(auth, { isAuthenticated: true, token: 'token' })
    rerender()
    expect(subscribe).toHaveBeenCalledWith('fp1', expect.any(Function))
  })
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

describe('useFeedWebsocket frames about posts', () => {
  it('changes the one post and does not reload the list', () => {
    applyFrame.mockReturnValue(true)
    const { handle, client, reloads } = listen()
    const frame = {
      type: 'react/post',
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
