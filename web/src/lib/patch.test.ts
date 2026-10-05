// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, type InfiniteData } from '@tanstack/react-query'
import type { FeedPost } from '@/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyFrame } from './patch'

const { view } = vi.hoisted(() => ({ view: vi.fn() }))

vi.mock('@/api/feeds', () => ({ feedsApi: { view } }))
// The adapter pulls in the auth store and the translation runtime; the posts
// here are already in the page's shape.
vi.mock('@/api/adapters', () => ({
  mapPosts: (posts?: unknown[]) => posts ?? [],
}))

type Lists = InfiniteData<{ posts: FeedPost[] }>

const KEY = ['posts', 'f1', { unread: true }]

function post(id: string, extra: Partial<FeedPost> = {}): FeedPost {
  return {
    id,
    feedId: 'f1',
    author: 'Feed',
    role: 'Feed',
    created: 0,
    body: id,
    reactions: {} as FeedPost['reactions'],
    comments: [],
    ...extra,
  }
}

/** A client holding one list of `posts`. */
function holding(...posts: FeedPost[]): QueryClient {
  const client = new QueryClient()
  client.setQueryData<Lists>(KEY, {
    pages: [{ posts }],
    pageParams: [undefined],
  })
  return client
}

function listed(client: QueryClient): FeedPost[] {
  return client.getQueryData<Lists>(KEY)!.pages.flatMap((page) => page.posts)
}

/** The server's answer to a fetch of one post. */
function answer(fresh: FeedPost) {
  view.mockResolvedValue({ data: { posts: [fresh] } })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('a frame about one post', () => {
  it('fetches that post alone and changes it where it stands', async () => {
    const client = holding(post('a'), post('b'), post('c'))
    answer(post('b', { body: 'edited' }))

    expect(
      applyFrame(client, { type: 'react/post', feed: 'f1', post: 'b' })
    ).toBe(true)
    await vi.advanceTimersByTimeAsync(250)

    expect(view).toHaveBeenCalledTimes(1)
    expect(view).toHaveBeenCalledWith({ feed: 'f1', post: 'b' })
    expect(listed(client).map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(listed(client)[1].body).toBe('edited')
  })

  it('keeps what only the list knows of the post', async () => {
    const permissions = {
      view: true,
      react: true,
      comment: false,
      manage: false,
    }
    const client = holding(
      post('a'),
      post('b', { score: 7, read: 123, permissions, feedName: 'Listed' })
    )
    // Fetched by itself: no score, no per-post permissions, and the read mark
    // made here has not reached the server.
    answer(post('b', { body: 'edited', read: 0, feedName: 'Fetched' }))

    applyFrame(client, { type: 'comment/create', feed: 'f1', post: 'b' })
    await vi.advanceTimersByTimeAsync(250)

    const patched = listed(client)[1]
    expect(patched.body).toBe('edited')
    expect(patched.score).toBe(7)
    expect(patched.read).toBe(123)
    expect(patched.permissions).toBe(permissions)
    expect(patched.feedName).toBe('Listed')
  })

  it('makes one fetch for a burst about the same post', async () => {
    const client = holding(post('a'), post('b'))
    answer(post('b'))

    applyFrame(client, { type: 'tag/add', feed: 'f1', post: 'b' })
    applyFrame(client, { type: 'tag/add', feed: 'f1', post: 'b' })
    applyFrame(client, { type: 'post/edit', feed: 'f1', post: 'b' })
    await vi.advanceTimersByTimeAsync(1000)

    expect(view).toHaveBeenCalledTimes(1)
  })

  it('fetches nothing for a post no list holds', async () => {
    const client = holding(post('a'))

    expect(
      applyFrame(client, { type: 'post/edit', feed: 'f1', post: 'elsewhere' })
    ).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)

    expect(view).not.toHaveBeenCalled()
  })

  it('leaves the post as it was when the fetch fails', async () => {
    const client = holding(post('a'), post('b'))
    view.mockRejectedValue(new Error('offline'))

    applyFrame(client, { type: 'react/post', feed: 'f1', post: 'b' })
    await vi.advanceTimersByTimeAsync(250)

    expect(listed(client).map((item) => item.body)).toEqual(['a', 'b'])
  })

  it('takes a deleted post out of the list without fetching anything', async () => {
    const client = holding(post('a'), post('b'), post('c'))

    expect(
      applyFrame(client, { type: 'post/delete', feed: 'f1', post: 'b' })
    ).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)

    expect(listed(client).map((item) => item.id)).toEqual(['a', 'c'])
    expect(view).not.toHaveBeenCalled()
  })
})

describe('a frame that is not about one post', () => {
  it('is left for the caller to reload the lists', () => {
    const client = holding(post('a'))

    expect(applyFrame(client, { type: 'feed/update', feed: 'f1' })).toBe(false)
    expect(applyFrame(client, { type: 'post/edit', feed: 'f1' })).toBe(false)
    // A new post is not in any list yet: there is nothing to change in place.
    expect(
      applyFrame(client, { type: 'post/create', feed: 'f1', post: 'new' })
    ).toBe(false)
  })
})
