// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { createElement, type ComponentType } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { feedsApi } from '@/api/feeds'
import { useFeedsStore } from '@/stores/feeds-store'
import { Route } from './index'

const state = vi.hoisted(() => ({
  loaderData: undefined as unknown,
  listProps: undefined as unknown,
}))

vi.mock('@/api/feeds', () => ({ feedsApi: { find: vi.fn(), view: vi.fn() } }))
vi.mock('@/hooks/use-feeds-storage', () => ({
  getLastFeed: vi.fn().mockResolvedValue(null),
  clearLastFeed: vi.fn(),
}))
vi.mock('@/features/feeds/pages', () => ({
  EntityFeedPage: () => null,
  FeedsListPage: (props: unknown) => {
    state.listProps = props
    return null
  },
}))
vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => state.loaderData,
  }),
  useRouter: () => ({ invalidate: vi.fn() }),
}))

const route = Route as unknown as {
  loader: () => Promise<{ answer?: { data: unknown } }>
  component: ComponentType
}

describe('feeds index loader', () => {
  it('hands its feed list to the sidebar, which then does not ask for it', async () => {
    useFeedsStore.setState({ feeds: [], loaded: false })
    vi.mocked(feedsApi.find).mockResolvedValue({
      data: {
        entity: false,
        feeds: [{ id: 'a', name: 'A', fingerprint: 'a' }],
        settings: { sort: 'hot' },
      },
    })

    await route.loader()

    const store = useFeedsStore.getState()
    expect(store.loaded).toBe(true)
    expect(store.defaultSort).toBe('hot')
    expect(store.feeds.map((feed) => feed.id)).toEqual(['a'])
    expect(feedsApi.view).not.toHaveBeenCalled()
  })

  it('hands the timeline its answer, so the first load does not ask again', async () => {
    const data = {
      entity: false,
      feeds: [{ id: 'a', name: 'A', fingerprint: 'a' }],
      user_id: 'me',
    }
    vi.mocked(feedsApi.find).mockResolvedValue({ data })

    const loaded = await route.loader()
    expect(loaded.answer?.data).toBe(data)

    state.loaderData = loaded
    render(createElement(route.component))
    expect(state.listProps).toEqual(
      expect.objectContaining({ initial: loaded.answer })
    )
  })
})
