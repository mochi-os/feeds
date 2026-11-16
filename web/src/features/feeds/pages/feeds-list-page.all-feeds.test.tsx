// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import {
  QueryClient,
  QueryClientProvider,
  type InfiniteData,
} from '@tanstack/react-query'
import { useInfinitePosts } from '@/hooks'
import type { FeedPost } from '@/types'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { feedsApi } from '@/api/feeds'
import { FeedsListPage } from './feeds-list-page'

// Held at module level: the page buckets these on every change of identity.
const { feeds, posts, user } = vi.hoisted(() => ({
  feeds: [{ id: 'f1', name: 'News', unreadPosts: 0, isSubscribed: true }],
  posts: [{ id: 'p1', feedId: 'f1', read: 0 }],
  user: { isAuthenticated: true, identity: 'u1', name: 'User' },
}))

vi.mock('@/api/feeds', () => ({
  feedsApi: { clearAllNotifications: vi.fn(), addPostTag: vi.fn() },
}))
vi.mock('@mochi/web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mochi/web')>()
  return {
    ...actual,
    useAuthStore: (select: (state: typeof user) => unknown) => select(user),
    useShellStorage: () => ['all', vi.fn()],
  }
})
vi.mock('@/hooks', () => ({
  useFeeds: () => ({
    feeds,
    setFeeds: vi.fn(),
    isLoadingFeeds: false,
    refreshFeedsFromApi: async () => {},
    userId: 'u1',
    error: null,
    hasAi: false,
  }),
  useInfinitePosts: vi.fn(() => ({
    posts,
    isLoading: false,
    error: null,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
    refetch: async () => {},
    reload: async () => {},
    seen: undefined,
  })),
  useFeedsWebsocket: () => {},
  useMarkAsRead: () => ({ markRead: vi.fn() }),
  useReadOnScroll: () => ({ observePost: vi.fn() }),
  usePostActions: () => ({ handlePostReaction: vi.fn() }),
  useCommentActions: () => ({}),
}))
vi.mock('../hooks', () => ({ usePostHandlers: () => ({}) }))
vi.mock('@/context/sidebar-context', () => ({
  useSidebarContext: () => ({
    postRefreshHandler: { current: null },
    openCreateFeedDialog: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-feeds-storage', () => ({ setLastFeed: vi.fn() }))
vi.mock('@/components/options-menu', () => ({ OptionsMenu: () => null }))
vi.mock('../components/inline-feed-search', () => ({
  InlineFeedSearch: () => null,
}))
vi.mock('../components/recommended-feeds', () => ({
  RecommendedFeeds: () => null,
}))
// A post's tag, as the tags menu offers it to filter by.
vi.mock('../components/feed-posts', () => ({
  FeedPosts: ({
    posts,
    onTagFilter,
    onTagAdded,
  }: {
    posts: FeedPost[]
    onTagFilter?: (label: string) => void
    onTagAdded?: (feed: string, post: string, label: string) => Promise<void>
  }) => (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>
          <button type='button' onClick={() => onTagFilter?.('harbour')}>
            #harbour
          </button>
          <button
            type='button'
            onClick={() => void onTagAdded?.(post.feedId, post.id, 'quay')}
          >
            Add quay
          </button>
        </li>
      ))}
    </ul>
  ),
}))

const asked = () => vi.mocked(useInfinitePosts).mock.lastCall?.[0]

function page(client = new QueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider i18n={i18n}>
        <FeedsListPage />
      </I18nProvider>
    </QueryClientProvider>
  )
}

describe('All feeds', () => {
  beforeEach(() => {
    vi.mocked(useInfinitePosts).mockClear()
    vi.mocked(feedsApi.clearAllNotifications).mockReset()
    vi.mocked(feedsApi.clearAllNotifications).mockResolvedValue(undefined)
    user.isAuthenticated = true
    i18n.loadAndActivate({ locale: 'en', messages: {} })
  })

  // As a single feed filters by the tag picked from one of its posts.
  it('lists the posts carrying a tag picked from a post, until the filter is cleared', async () => {
    const click = userEvent.setup()
    page()
    expect(asked()).toMatchObject({ aggregate: true, tag: undefined })

    await click.click(await screen.findByRole('button', { name: '#harbour' }))
    expect(asked()).toMatchObject({ aggregate: true, tag: 'harbour' })
    expect(screen.getByText('Filtered by tag:')).toBeInTheDocument()

    await click.click(screen.getByRole('button', { name: 'harbour' }))
    expect(asked()).toMatchObject({ aggregate: true, tag: undefined })
    expect(screen.queryByText('Filtered by tag:')).not.toBeInTheDocument()
  })

  // As opening one feed clears its own.
  it("clears every feed's notifications as it opens", () => {
    page()
    expect(feedsApi.clearAllNotifications).toHaveBeenCalledTimes(1)
  })

  it('clears none for a visitor who is not signed in', () => {
    user.isAuthenticated = false
    page()
    expect(feedsApi.clearAllNotifications).not.toHaveBeenCalled()
  })

  it('stays quiet when the clear is refused', async () => {
    vi.mocked(feedsApi.clearAllNotifications).mockRejectedValue(
      new Error('refused')
    )
    page()
    await Promise.resolve()
    expect(feedsApi.clearAllNotifications).toHaveBeenCalledTimes(1)
  })
})

// The page rebuilds what it shows from the posts cache on the next page or
// refetch, so a tag added from All feeds goes there too, as on one feed.
describe('All feeds tags', () => {
  beforeEach(() => {
    vi.mocked(feedsApi.clearAllNotifications).mockResolvedValue(undefined)
    user.isAuthenticated = true
    i18n.loadAndActivate({ locale: 'en', messages: {} })
  })

  it('writes a tag added to a post into the posts cache', async () => {
    vi.mocked(feedsApi.addPostTag).mockResolvedValue({
      id: 't1',
      label: 'quay',
    })
    const client = new QueryClient()
    const key = ['posts', '__all__', { aggregate: true }]
    client.setQueryData<InfiniteData<{ posts: FeedPost[] }>>(key, {
      pages: [{ posts: [{ ...posts[0], tags: [] } as unknown as FeedPost] }],
      pageParams: [undefined],
    })
    page(client)

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Add quay' }))

    await vi.waitFor(() =>
      expect(
        client
          .getQueryData<InfiniteData<{ posts: FeedPost[] }>>(key)
          ?.pages[0].posts[0].tags?.map((tag) => tag.label)
      ).toEqual(['quay'])
    )
  })
})
