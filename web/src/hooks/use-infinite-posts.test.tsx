// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { FeedPost } from '@/types'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  keptPosts,
  postsKey,
  prefetchPosts,
  useInfinitePosts,
  type PostsPrefetch,
} from './use-infinite-posts'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/api/feeds', () => ({ feedsApi: { get } }))
// The adapter pulls in the auth store and the translation runtime; the posts
// here are already in the page's shape.
vi.mock('@/api/adapters', () => ({
  mapPosts: (posts?: unknown[]) => posts ?? [],
}))

function post(id: string): FeedPost {
  return {
    id,
    feedId: 'f1',
    author: 'Feed',
    role: 'Feed',
    created: 0,
    body: id,
    reactions: {} as FeedPost['reactions'],
    comments: [],
  }
}

function list(...ids: string[]): FeedPost[] {
  return ids.map(post)
}

/** The first page the server gives, and the page after it when there is one. */
let head: FeedPost[] = []
let tail: FeedPost[] | null = null

interface Options {
  unread: boolean
  sort: string
}

function mount(options: Options) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(
    (current: Options) => useInfinitePosts({ feedId: 'f1', ...current }),
    { wrapper, initialProps: options }
  )
  const ids = () => hook.result.current.posts.map((item) => item.id)
  /** A frame about the feed as a whole lands: every list of it is refetched. */
  const refetched = () =>
    act(() => client.invalidateQueries({ queryKey: ['posts'] }))
  return { hook, ids, refetched }
}

beforeEach(() => {
  vi.clearAllMocks()
  head = list('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j')
  tail = null
  get.mockImplementation(async (_feed: string, cursor: { before?: number }) => {
    if (cursor.before !== undefined) {
      return { data: { posts: tail ?? [], hasMore: false } }
    }
    return { data: { posts: head, hasMore: tail !== null, nextCursor: 5 } }
  })
})

describe('keptPosts', () => {
  const loaded = list('a', 'b', 'c')

  it('is everything up to and including the post reached', () => {
    expect(keptPosts(loaded, 'b').map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('is nothing when no post has been reached, or it has left the list', () => {
    expect(keptPosts(loaded, null)).toEqual([])
    expect(keptPosts(loaded, 'gone')).toEqual([])
  })
})

describe('an unread list refetched without the reader asking', () => {
  it('keeps the posts they have reached, and what is still unread follows', async () => {
    const { hook, ids, refetched } = mount({ unread: true, sort: 'new' })
    await waitFor(() => expect(ids()).toHaveLength(10))
    act(() => hook.result.current.seen('e'))
    // The server no longer lists what has been read on the way to e.
    head = list('f', 'g', 'h')

    await refetched()

    await waitFor(() =>
      expect(ids()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
    )
  })

  it('keeps as much when the reader has scrolled back up since', async () => {
    const { hook, ids, refetched } = mount({ unread: true, sort: 'new' })
    await waitFor(() => expect(ids()).toHaveLength(10))
    act(() => hook.result.current.seen('e'))
    act(() => hook.result.current.seen('b'))
    head = list('f', 'g', 'h')

    await refetched()

    await waitFor(() =>
      expect(ids()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
    )
  })

  it('keeps a post once, where it was, when the server still lists it', async () => {
    const { hook, ids, refetched } = mount({ unread: true, sort: 'new' })
    await waitFor(() => expect(ids()).toHaveLength(10))
    act(() => hook.result.current.seen('c'))
    // b was scrolled past too fast to be marked read; a newer post has arrived.
    head = list('new', 'b', 'd', 'e')

    await refetched()

    await waitFor(() => expect(ids()).toEqual(['a', 'b', 'c', 'new', 'd', 'e']))
  })

  it('leaves out of a later page what the head of the list kept', async () => {
    tail = list('k')
    const { hook, ids, refetched } = mount({ unread: true, sort: 'new' })
    await waitFor(() => expect(ids()).toHaveLength(10))
    act(() => hook.result.current.seen('c'))
    head = list('d', 'e')
    await refetched()
    await waitFor(() => expect(ids()).toEqual(['a', 'b', 'c', 'd', 'e']))
    // The page after repeats a kept post, as a list that shrinks while it is paged does.
    tail = list('c', 'k')

    await act(() => hook.result.current.fetchNextPage())

    await waitFor(() => expect(ids()).toEqual(['a', 'b', 'c', 'd', 'e', 'k']))
  })
})

describe('an unread list reloaded because the reader asked', () => {
  it('is the list as it now is', async () => {
    const { hook, ids } = mount({ unread: true, sort: 'new' })
    await waitFor(() => expect(ids()).toHaveLength(10))
    act(() => hook.result.current.seen('e'))
    head = list('f', 'g', 'h')

    await act(() => hook.result.current.reload())

    await waitFor(() => expect(ids()).toEqual(['f', 'g', 'h']))
  })

  it('is the list as it now is though posts pass on screen while it loads', async () => {
    const { hook, ids } = mount({ unread: true, sort: 'new' })
    await waitFor(() => expect(ids()).toHaveLength(10))
    act(() => hook.result.current.seen('e'))
    // The reload scrolls the page to the top, and the posts on the way are seen.
    let answer: (value: unknown) => void = () => {}
    get.mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve))
    )

    let reloading: Promise<void> = Promise.resolve()
    act(() => {
      reloading = hook.result.current.reload()
    })
    act(() => hook.result.current.seen('c'))
    answer({ data: { posts: list('f', 'g', 'h'), hasMore: false } })
    await act(() => reloading)

    await waitFor(() => expect(ids()).toEqual(['f', 'g', 'h']))
  })

  it('leaves nothing reached before it to be kept after', async () => {
    const { hook, ids, refetched } = mount({ unread: true, sort: 'new' })
    await waitFor(() => expect(ids()).toHaveLength(10))
    act(() => hook.result.current.seen('e'))
    // Seen but not yet read, so the server still lists them, under a new post.
    head = list('new', 'a', 'b', 'c', 'd', 'e', 'f')
    await act(() => hook.result.current.reload())
    await waitFor(() => expect(ids()).toHaveLength(7))
    // The new post is read elsewhere. Nothing of this list has been on screen.
    head = list('a', 'b', 'c', 'd', 'e', 'f')

    await refetched()

    await waitFor(() => expect(ids()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']))
  })
})

describe('a different list', () => {
  it('starts again: what was reached under another sort is not kept', async () => {
    const { hook, ids, refetched } = mount({ unread: true, sort: 'new' })
    await waitFor(() => expect(ids()).toHaveLength(10))
    act(() => hook.result.current.seen('e'))

    hook.rerender({ unread: true, sort: 'top' })
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(ids()).toHaveLength(10))
    head = list('f', 'g', 'h', 'i', 'j')
    await refetched()

    await waitFor(() => expect(ids()).toEqual(['f', 'g', 'h', 'i', 'j']))
  })

  it('without the unread filter is the list as the server gives it', async () => {
    const { hook, ids, refetched } = mount({ unread: false, sort: 'new' })
    await waitFor(() => expect(ids()).toHaveLength(10))
    act(() => hook.result.current.seen('e'))
    // b has been deleted.
    head = list('a', 'c', 'd', 'e', 'f')

    await refetched()

    await waitFor(() => expect(ids()).toEqual(['a', 'c', 'd', 'e', 'f']))
  })
})

describe('a first page the route loader prefetched', () => {
  interface Props {
    sort: string
    prefetched?: PostsPrefetch
  }

  function open(client: QueryClient, initialProps: Props) {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const hook = renderHook(
      (current: Props) =>
        useInfinitePosts({ feedId: 'f1', unread: false, ...current }),
      { wrapper, initialProps }
    )
    const ids = () => hook.result.current.posts.map((item) => item.id)
    return { hook, ids }
  }

  function client() {
    return new QueryClient({ defaultOptions: { queries: { retry: false } } })
  }

  // Long enough for a mount-time fetch to have been started, were one coming.
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

  const wanted = { feedId: 'f1', sort: 'new', unread: false }

  it('is shown without asking for it again', async () => {
    const queries = client()
    const prefetched = prefetchPosts(queries, wanted)
    await waitFor(() => expect(prefetched?.data).toBeDefined())
    expect(get).toHaveBeenCalledTimes(1)

    const { ids } = open(queries, { sort: 'new', prefetched })
    expect(ids()).toHaveLength(10)
    await settle()

    expect(get).toHaveBeenCalledTimes(1)
  })

  it('is joined, not asked for again, by a page that mounts while it is on its way', async () => {
    let answer: (value: unknown) => void = () => {}
    get.mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve))
    )
    const queries = client()
    const prefetched = prefetchPosts(queries, wanted)

    const { ids } = open(queries, { sort: 'new', prefetched })
    await settle()
    answer({ data: { posts: head, hasMore: false } })

    await waitFor(() => expect(ids()).toHaveLength(10))
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('is asked for again on a later mount: a return shows what has changed', async () => {
    const queries = client()
    const prefetched = prefetchPosts(queries, wanted)
    await waitFor(() => expect(prefetched?.data).toBeDefined())
    const first = open(queries, { sort: 'new', prefetched })
    await settle()
    first.hook.unmount()

    // The router shows its cached loader data on a return.
    open(queries, { sort: 'new', prefetched })

    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
  })

  it('does not stand for a list asked for another way', async () => {
    const queries = client()
    const prefetched = prefetchPosts(queries, wanted)
    await waitFor(() => expect(prefetched?.data).toBeDefined())
    // The list in the order the page asks for is cached from earlier.
    queries.setQueryData(postsKey({ ...wanted, sort: 'top' }), {
      pages: [{ posts: [post('old')], hasMore: false }],
      pageParams: [undefined],
    })

    const { ids } = open(queries, { sort: 'top', prefetched })

    await waitFor(() => expect(ids()).toHaveLength(10))
    expect(get).toHaveBeenCalledTimes(2)
    expect(get).toHaveBeenLastCalledWith(
      'f1',
      expect.objectContaining({ sort: 'top' })
    )
  })

  it('is asked for again on mount when the prefetch failed over an older list', async () => {
    const queries = client()
    queries.setQueryData(postsKey(wanted), {
      pages: [{ posts: [post('old')], hasMore: false }],
      pageParams: [undefined],
    })
    get.mockRejectedValueOnce(new Error('offline'))
    const prefetched = prefetchPosts(queries, wanted)
    await waitFor(() =>
      expect(queries.getQueryState(postsKey(wanted))?.status).toBe('error')
    )
    await settle()
    expect(prefetched?.data).toBeUndefined()

    const { ids } = open(queries, { sort: 'new', prefetched })

    await waitFor(() => expect(ids()).toHaveLength(10))
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('is asked for again on mount when an event invalidated it since', async () => {
    const queries = client()
    const prefetched = prefetchPosts(queries, wanted)
    await waitFor(() => expect(prefetched?.data).toBeDefined())
    // A post event from another page lands before this one mounts.
    await queries.invalidateQueries({ queryKey: ['posts'] })

    open(queries, { sort: 'new', prefetched })

    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
  })

  const early = (asked: number) => ({
    asked,
    page: Promise.resolve({
      posts: [post('early')],
      hasMore: false,
      nextCursor: undefined,
      cursor: undefined,
      permissions: undefined,
      hasAi: false,
    }),
  })

  it('uses a page already on its way once, and asks afresh after', async () => {
    const queries = client()
    const prefetched = prefetchPosts(queries, wanted, early(Date.now()))
    await waitFor(() => expect(prefetched?.data).toBeDefined())
    expect(get).not.toHaveBeenCalled()

    // Fetched again before any page holds the list, as the loader left it.
    await queries.refetchQueries({ queryKey: ['posts'] })

    expect(get).toHaveBeenCalledTimes(1)
  })

  it('does not use a page asked for before what the list already holds', async () => {
    const queries = client()
    queries.setQueryData(postsKey(wanted), {
      pages: [{ posts: [post('newer')], hasMore: false }],
      pageParams: [undefined],
    })

    const prefetched = prefetchPosts(queries, wanted, early(Date.now() - 1000))
    await waitFor(() => expect(prefetched?.data).toBeDefined())

    expect(get).toHaveBeenCalledTimes(1)
  })

  it('leaves a list a page already shows to that page', async () => {
    const queries = client()
    const { ids } = open(queries, { sort: 'new' })
    await waitFor(() => expect(ids()).toHaveLength(10))

    const prefetched = prefetchPosts(queries, wanted)
    await settle()

    expect(prefetched).toBeUndefined()
    expect(get).toHaveBeenCalledTimes(1)
  })
})

describe('the page after the first', () => {
  type Asked = { before?: number; cursor?: string; offset?: number }

  /** The first page, then a second, as a server with or without cursor gives them. */
  function serve(first: Record<string, unknown>, second: FeedPost[]) {
    get.mockImplementation(async (_feed: string, asked: Asked) =>
      asked.before === undefined &&
      asked.cursor === undefined &&
      asked.offset === undefined
        ? { data: { posts: list('a', 'b'), hasMore: true, ...first } }
        : { data: { posts: second, hasMore: false } }
    )
  }

  async function next(sort: string) {
    const { hook, ids } = mount({ unread: false, sort })
    await waitFor(() => expect(ids()).toEqual(['a', 'b']))
    await act(() => hook.result.current.fetchNextPage())
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    return { asked: get.mock.calls[1][1] as Asked, ids }
  }

  it("resumes where the server's cursor says", async () => {
    serve({ nextCursor: 1790000000, cursor: '1790000000:b' }, list('c'))
    const { asked } = await next('new')
    expect(asked.cursor).toBe('1790000000:b')
    expect(asked.before).toBeUndefined()
  })

  it('a scored page resumes by its cursor too', async () => {
    serve({ nextCursor: 2, cursor: '2:1790000000' }, list('c'))
    const { asked } = await next('top')
    expect(asked.cursor).toBe('2:1790000000')
    expect(asked.before).toBeUndefined()
  })

  it('is asked by before of a server that sends no cursor', async () => {
    serve({ nextCursor: 1790000000 }, list('c'))
    const { asked } = await next('new')
    expect(asked.before).toBe(1790000000)
    expect(asked.cursor).toBeUndefined()
  })

  it('shows a post the later page repeats once', async () => {
    serve({ nextCursor: 2, cursor: '2:1790000000' }, list('b', 'c'))
    const { ids } = await next('top')
    await waitFor(() => expect(ids()).toEqual(['a', 'b', 'c']))
  })
})
