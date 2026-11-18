// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useState, type ReactNode } from 'react'
import {
  QueryClient,
  QueryClientProvider,
  type InfiniteData,
} from '@tanstack/react-query'
import type { FeedPost } from '@/types'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createReactionCounts } from '@/features/feeds/constants'
import { useCommentActions } from './use-comment-actions'

const { createComment, reactToComment } = vi.hoisted(() => ({
  createComment: vi.fn().mockResolvedValue({ data: {} }),
  reactToComment: vi.fn(),
}))

vi.mock('@/api/feeds', () => ({ feedsApi: { createComment, reactToComment } }))

function actions() {
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    </QueryClientProvider>
  )
  return renderHook(
    () =>
      useCommentActions({
        setFeeds: () => {},
        setPostsByFeed: () => {},
        currentUserId: 'user-1',
        currentUserName: 'Me',
        commentDrafts: {},
        setCommentDrafts: () => {},
      }),
    { wrapper }
  ).result
}

describe('useCommentActions', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
    createComment.mockClear()
  })

  // Where a comment goes out is the server's to decide, from where the post
  // and the comment answered are; the client names no account.
  it('sends a reply to a comment by its post, parent and body, naming no account', async () => {
    const result = actions()
    await act(() =>
      result.current.handleReplyToComment(
        'feed-1',
        'post-1',
        'comment-1',
        'An answer'
      )
    )
    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        feed: 'feed-1',
        post: 'post-1',
        parent: 'comment-1',
        body: 'An answer',
      })
    )
    expect(createComment.mock.calls[0][0]).not.toHaveProperty('account')
  })

  it('sends a comment on the post naming no account', async () => {
    const result = actions()
    await act(() =>
      result.current.handleAddComment('feed-1', 'post-1', 'A comment')
    )
    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'A comment' })
    )
    expect(createComment.mock.calls[0][0]).not.toHaveProperty('account')
  })
})

describe('a comment reaction in the feed list', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
  })

  const listPost = {
    id: 'post-1',
    feedId: 'feed-1',
    comments: [
      {
        id: 'comment-1',
        reactions: createReactionCounts({ like: 1 }),
        userReaction: null,
      },
    ],
  } as unknown as FeedPost
  const likes = (p?: FeedPost) => p?.comments[0].reactions.like
  type Pages = InfiniteData<{ posts: FeedPost[] }>

  // The list re-syncs its posts from the ['posts'] cache, so both hold it.
  it('shows at once in the list and its cache, and goes back when refused', async () => {
    let refuse: (error: unknown) => void = () => {}
    reactToComment.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          refuse = reject
        })
    )
    const client = new QueryClient()
    const key = ['posts', 'feed-1']
    client.setQueryData<Pages>(key, {
      pages: [{ posts: [listPost] }],
      pageParams: [undefined],
    })
    const { result } = renderHook(
      () => {
        const [postsByFeed, setPostsByFeed] = useState<
          Record<string, FeedPost[]>
        >({ 'feed-1': [listPost] })
        const actions = useCommentActions({
          setFeeds: () => {},
          setPostsByFeed,
          commentDrafts: {},
          setCommentDrafts: () => {},
        })
        return { postsByFeed, actions }
      },
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>
            <I18nProvider i18n={i18n}>{children}</I18nProvider>
          </QueryClientProvider>
        ),
      }
    )
    const cached = () => client.getQueryData<Pages>(key)?.pages[0].posts[0]

    act(() =>
      result.current.actions.handleCommentReaction(
        'feed-1',
        'post-1',
        'comment-1',
        'like'
      )
    )
    expect(likes(result.current.postsByFeed['feed-1'][0])).toBe(2)
    expect(likes(cached())).toBe(2)

    await act(async () => refuse(new Error('refused')))
    await waitFor(() =>
      expect(likes(result.current.postsByFeed['feed-1'][0])).toBe(1)
    )
    expect(likes(cached())).toBe(1)
  })
})

// The pages show what the ['posts'] caches hold and rebuild from them on the
// next page or refetch, so a comment written there too survives one; All feeds'
// cache and a single feed's alike.
describe('a comment in the posts caches', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
    createComment.mockReset()
  })

  type Pages = InfiniteData<{ posts: FeedPost[] }>
  const listPost = {
    id: 'post-1',
    feedId: 'feed-1',
    comments: [{ id: 'comment-1', replies: [] }],
  } as unknown as FeedPost
  const keys = [
    ['posts', '__all__', { aggregate: true }],
    ['posts', 'feed-1', { aggregate: false }],
  ]

  function cached() {
    const client = new QueryClient()
    for (const key of keys) {
      client.setQueryData<Pages>(key, {
        pages: [{ posts: [listPost] }],
        pageParams: [undefined],
      })
    }
    const { result } = renderHook(
      () =>
        useCommentActions({
          setFeeds: () => {},
          setPostsByFeed: () => {},
          currentUserId: 'user-1',
          currentUserName: 'Me',
          commentDrafts: {},
          setCommentDrafts: () => {},
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>
            <I18nProvider i18n={i18n}>{children}</I18nProvider>
          </QueryClientProvider>
        ),
      }
    )
    const posts = () =>
      keys.map((key) => client.getQueryData<Pages>(key)?.pages[0].posts[0])
    return { result, posts }
  }

  it('writes a comment into every cache holding its post, and takes it out when refused', async () => {
    let refuse: (error: unknown) => void = () => {}
    createComment.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          refuse = reject
        })
    )
    const { result, posts } = cached()

    let sent: Promise<void> = Promise.resolve()
    act(() => {
      sent = result.current
        .handleAddComment('feed-1', 'post-1', 'A comment')
        .catch(() => {})
    })
    for (const post of posts()) {
      expect(post?.comments.map((c) => c.body ?? c.id)).toEqual([
        'A comment',
        'comment-1',
      ])
    }

    await act(async () => {
      refuse(new Error('refused'))
      await sent
    })
    for (const post of posts()) {
      expect(post?.comments.map((c) => c.id)).toEqual(['comment-1'])
    }
  })

  it('writes a reply under its comment in every cache, once', async () => {
    createComment.mockResolvedValue({ data: {} })
    const { result, posts } = cached()

    await act(() =>
      result.current.handleReplyToComment(
        'feed-1',
        'post-1',
        'comment-1',
        'An answer'
      )
    )
    for (const post of posts()) {
      expect(post?.comments[0].replies?.map((r) => r.body)).toEqual([
        'An answer',
      ])
    }
  })
})
