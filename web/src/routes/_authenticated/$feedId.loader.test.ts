// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@mochi/web'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useFeedsStore } from '@/stores/feeds-store'
import { postsKey, useInfinitePosts } from '@/hooks/use-infinite-posts'
import { loadFeed } from './$feedId'

const { getInfo, get, filter } = vi.hoisted(() => ({
  getInfo: vi.fn(),
  get: vi.fn(),
  filter: { current: 'all' as 'all' | 'unread' },
}))

vi.mock('@/api/feeds', () => ({ feedsApi: { getInfo, get } }))
vi.mock('@/hooks/use-read-filter', () => ({ readFilter: () => filter.current }))
// The posts arrive in the page's shape already.
vi.mock('@/api/adapters', () => ({
  mapPosts: (posts?: unknown[]) => posts ?? [],
  mapFeedsToSummaries: () => [],
}))
// The route component pulls the whole feed-page graph; the loader under test
// needs none of it.
vi.mock('@/features/feeds/pages', () => ({ EntityFeedPage: () => null }))

describe('$feedId loader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a not-found flag instead of redirecting when the feed is missing', async () => {
    getInfo.mockResolvedValueOnce({ data: { feed: null } })

    // Pre-fix this threw redirect({ to: '/' }); it must now resolve.
    const result = await loadFeed('deadbeef0')

    expect(result.notFound).toBe(true)
    expect(result.feed).toBeNull()
    expect(result.loaderError).toBeNull()
  })

  it('treats a feed row with no id as not found', async () => {
    getInfo.mockResolvedValueOnce({ data: { feed: { name: 'ghost' } } })

    const result = await loadFeed('deadbeef0')

    expect(result.notFound).toBe(true)
  })

  it('returns the feed when present', async () => {
    getInfo.mockResolvedValueOnce({
      data: { feed: { id: 'f1', name: 'Feed' }, permissions: { view: true } },
    })

    const result = await loadFeed('f1')

    expect(result.notFound).toBe(false)
    expect(result.feed?.id).toBe('f1')
    expect(result.permissions).toEqual({ view: true })
  })

  it('carries the error message (not a not-found) when the info request throws', async () => {
    getInfo.mockRejectedValueOnce(new Error('offline'))

    const result = await loadFeed('f1')

    expect(result.notFound).toBe(false)
    expect(result.feed).toBeNull()
    expect(result.loaderError).toBe('offline')
  })

  it('keeps the thrown error so the page can read its status', async () => {
    const denied = Object.assign(new Error('This feed is private'), {
      response: { status: 403 },
    })
    getInfo.mockRejectedValueOnce(denied)

    const result = await loadFeed('f1')

    expect(result.error).toBe(denied)
    expect(result.loaderError).toBe('This feed is private')
  })
})

describe('$feedId loader posts', () => {
  const ID = '1feedentityidentifierfeedentityidentifier12345'

  /** An answer for the feed's row that comes when told to. */
  function pendingInfo(sort?: string) {
    let answer: () => void = () => {}
    const promise = new Promise((resolve) => {
      answer = () =>
        resolve({
          data: { feed: { id: ID, fingerprint: 'fp', name: 'Feed', sort } },
        })
    })
    getInfo.mockReturnValueOnce(promise)
    return answer
  }

  function client() {
    return new QueryClient({ defaultOptions: { queries: { retry: false } } })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    get.mockResolvedValue({
      data: { posts: [{ id: 'p1' }], hasMore: false },
    })
    getInfo.mockResolvedValue({
      data: { feed: { id: ID, fingerprint: 'fp', name: 'Feed' } },
    })
    filter.current = 'all'
    useAuthStore.setState({ isAuthenticated: true })
    useFeedsStore.setState({ feeds: [], defaultSort: '' })
  })

  it("asks for an unknown feed's posts alongside its row, of this server only, and files them for the page", async () => {
    const answer = pendingInfo()
    const queries = client()

    const loading = loadFeed('fp', { client: queries, cause: 'enter' })
    await Promise.resolve()

    // On their way while the row is still awaited, and never from elsewhere.
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(
      'fp',
      expect.objectContaining({ limit: 20, sort: 'interests', local: '1' })
    )
    answer()
    const data = await loading

    // Under the page's own query: the feed's id, as the row names it.
    await vi.waitFor(() => expect(data.prefetched?.data).toBeDefined())
    expect(get).toHaveBeenCalledTimes(1)
    expect(
      queries.getQueryData(
        postsKey({
          feedId: ID,
          entityContext: true,
          sort: 'interests',
          unread: false,
        })
      )
    ).toBe(data.prefetched?.data)
  })

  it("asks afresh when the row's sort is not the one the early page was asked in", async () => {
    const answer = pendingInfo('hot')
    const queries = client()

    const loading = loadFeed('fp', { client: queries, cause: 'enter' })
    answer()
    const data = await loading

    await vi.waitFor(() => expect(data.prefetched?.data).toBeDefined())
    expect(get).toHaveBeenCalledTimes(2)
    expect(get).toHaveBeenLastCalledWith(
      ID,
      expect.objectContaining({ sort: 'hot' })
    )
  })

  it('asks afresh when the early page was refused', async () => {
    get.mockRejectedValueOnce(
      Object.assign(new Error('Feed not found'), { response: { status: 404 } })
    )
    const answer = pendingInfo()
    const queries = client()

    const loading = loadFeed('fp', { client: queries, cause: 'enter' })
    answer()
    const data = await loading

    await vi.waitFor(() => expect(data.prefetched?.data).toBeDefined())
    expect(get).toHaveBeenCalledTimes(2)
    expect(get).toHaveBeenLastCalledWith(ID, expect.anything())
  })

  it('asks for no posts of a feed this server does not hold', async () => {
    getInfo.mockResolvedValueOnce({ data: { feed: null } })

    const data = await loadFeed('elsewhere', {
      client: client(),
      cause: 'enter',
    })

    expect(data.notFound).toBe(true)
    // Only the early page, asked of this server alone.
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(
      'elsewhere',
      expect.objectContaining({ local: '1' })
    )
  })

  it("asks by the feed's id and sort when the sidebar's list holds the feed", async () => {
    useFeedsStore.setState({
      feeds: [{ id: ID, fingerprint: 'fp', sort: 'top' } as never],
      defaultSort: 'hot',
    })
    filter.current = 'unread'
    const answer = pendingInfo()
    const queries = client()
    const key = postsKey({
      feedId: ID,
      entityContext: true,
      sort: 'top',
      unread: true,
    })

    const loading = loadFeed('fp', { client: queries, cause: 'enter' })
    await Promise.resolve()

    // Filed under the page's query at once, so a page already showing joins it.
    expect(queries.getQueryState(key)?.fetchStatus).toBe('fetching')
    expect(get).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({ sort: 'top', unread: '1' })
    )
    answer()
    const data = await loading
    await vi.waitFor(() => expect(data.prefetched?.data).toBeDefined())
    expect(queries.getQueryData(key)).toBe(data.prefetched?.data)
  })

  it('asks for no posts when the page refreshes itself', async () => {
    const queries = client()
    await loadFeed('fp', { client: queries, cause: 'enter' })

    const refreshed = await loadFeed('fp', { client: queries, cause: 'stay' })

    expect(get).toHaveBeenCalledTimes(1)
    expect(getInfo).toHaveBeenCalledTimes(2)
    expect(refreshed.prefetched).toBeUndefined()
  })

  it('asks for the first page of posts once when opening a feed', async () => {
    const answer = pendingInfo()
    const queries = client()
    const loading = loadFeed('fp', { client: queries, cause: 'enter' })
    answer()
    const data = await loading
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queries }, children)

    const { result } = renderHook(
      () =>
        useInfinitePosts({
          feedId: data.feed!.id,
          entityContext: true,
          sort: 'interests',
          unread: false,
          prefetched: data.prefetched,
        }),
      { wrapper }
    )

    await waitFor(() =>
      expect(result.current.posts.map((post) => post.id)).toEqual(['p1'])
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('starts the posts of a feed moved to from another', async () => {
    const queries = client()
    const first = await loadFeed('other', { client: queries, cause: 'enter' })
    await vi.waitFor(() => expect(first.prefetched?.data).toBeDefined())

    const moved = await loadFeed('fp', { client: queries, cause: 'stay' })

    expect(get).toHaveBeenCalledTimes(2)
    expect(get).toHaveBeenLastCalledWith(
      'fp',
      expect.objectContaining({ local: '1' })
    )
    expect(moved.prefetched).toBeDefined()
  })
})
