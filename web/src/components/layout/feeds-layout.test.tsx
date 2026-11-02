// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { feedsApi } from '@/api/feeds'
import { useFeedsStore } from '@/stores/feeds-store'
import { FeedsLayout } from './feeds-layout'

const state = vi.hoisted(() => ({
  listeners: [] as Array<(message: Record<string, unknown>) => void>,
}))

vi.mock('@/api/feeds', () => ({ feedsApi: { view: vi.fn() } }))
vi.mock('@/lib/saved', () => ({ loadSaved: vi.fn() }))
vi.mock('@/features/feeds/components/create-feed-dialog', () => ({
  CreateFeedDialog: () => null,
}))
vi.mock('@/features/feeds/components/new-post-dialog', () => ({
  NewPostDialog: () => null,
}))

vi.mock('@mochi/web', async (original) => ({
  ...(await original<typeof import('@mochi/web')>()),
  AuthenticatedLayout: () => null,
  MapTilesProvider: ({ children }: { children: ReactNode }) => children,
  onShellMessage: (listener: (message: Record<string, unknown>) => void) => {
    state.listeners.push(listener)
    return () => {}
  },
}))

/** A request for the feed list that answers when told to. */
function pending() {
  let answer: (value: unknown) => void = () => {}
  const promise = new Promise((resolve) => {
    answer = resolve
  })
  return { promise, answer: () => answer({ data: { feeds: [] } }) }
}

function show() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <FeedsLayout />
      </I18nProvider>
    </QueryClientProvider>
  )
}

/** The shell passes on a change to the reader's notifications. */
function notify(event: string) {
  act(() => {
    for (const listener of state.listeners) {
      listener({ type: 'notification-update', event })
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  state.listeners = []
  i18n.loadAndActivate({ locale: 'en', messages: {} })
  useFeedsStore.setState({ feeds: [], loaded: false })
})

describe('feeds layout', () => {
  it('does not ask for the feed list again when the route loader already holds it', async () => {
    useFeedsStore.setState({ loaded: true })

    show()
    await act(async () => {})

    expect(feedsApi.view).not.toHaveBeenCalled()
  })

  it('asks for the feed list once when nothing holds it', async () => {
    vi.mocked(feedsApi.view).mockResolvedValue({ data: { feeds: [] } })

    show()
    await act(async () => {})

    expect(feedsApi.view).toHaveBeenCalledTimes(1)
  })

  it('shares the load under way when notifications are read or cleared', async () => {
    const request = pending()
    vi.mocked(feedsApi.view).mockReturnValueOnce(request.promise as never)
    show()

    // Opening a feed clears its notifications while the sidebar is loading.
    notify('clear_object')
    await act(async () => request.answer())
    await act(async () => {})

    expect(feedsApi.view).toHaveBeenCalledTimes(1)
  })

  it('asks nothing when notifications are cleared after the list has loaded', async () => {
    vi.mocked(feedsApi.view).mockResolvedValue({ data: { feeds: [] } })
    show()
    await vi.waitFor(() => expect(useFeedsStore.getState().loaded).toBe(true))

    // The service announces a clear whether or not it cleared anything.
    notify('clear_object')
    await act(async () => {})

    expect(feedsApi.view).toHaveBeenCalledTimes(1)
  })

  it('asks again after the load under way when a notification arrives', async () => {
    const request = pending()
    vi.mocked(feedsApi.view)
      .mockReturnValueOnce(request.promise as never)
      .mockResolvedValue({ data: { feeds: [] } })
    show()

    // A new notification can come with a post the load under way predates.
    notify('new')
    expect(feedsApi.view).toHaveBeenCalledTimes(1)
    await act(async () => request.answer())

    await vi.waitFor(() => expect(feedsApi.view).toHaveBeenCalledTimes(2))
  })
})
