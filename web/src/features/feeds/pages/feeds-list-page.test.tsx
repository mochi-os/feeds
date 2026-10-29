// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { FeedPost } from '@/types'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { toast } from '@mochi/web'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { feedsApi } from '@/api/feeds'
import { useFeedsStore } from '@/stores/feeds-store'
import { FeedsListPage } from './feeds-list-page'

// Held at module level: the page buckets these on every change of identity.
const { feeds, posts } = vi.hoisted(() => ({
  feeds: [{ id: 'f1', name: 'News', unreadPosts: 3, isSubscribed: true }],
  posts: [{ id: 'p1', feedId: 'f1', read: 0 }],
}))

vi.mock('@/api/feeds', () => ({
  feedsApi: { readAllAggregate: vi.fn() },
}))
vi.mock('@mochi/web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mochi/web')>()
  const user = { isAuthenticated: true, identity: 'u1', name: 'User' }
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
  useInfinitePosts: () => ({
    posts,
    isLoading: false,
    error: null,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
    refetch: async () => {},
    reload: async () => {},
    seen: undefined,
  }),
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
// Each post as its id and whether it reads as read.
vi.mock('../components/feed-posts', () => ({
  FeedPosts: ({ posts }: { posts: FeedPost[] }) => (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>
          {post.id} {post.read ? 'read' : 'unread'}
        </li>
      ))}
    </ul>
  ),
}))

const badge = () =>
  useFeedsStore.getState().feeds.find((feed) => feed.id === 'f1')?.unreadPosts

async function markAllRead() {
  const user = userEvent.setup()
  // The header draws its actions once per layout.
  await user.click(screen.getAllByRole('button', { name: 'All' })[0])
  await user.click(
    await screen.findByRole('menuitem', { name: 'Mark all read' })
  )
}

// Mark all read clears the badges and posts on the click. A refusal puts
// back what it cleared, adding the counts back so a post that arrived
// meanwhile still counts.
describe('FeedsListPage Mark all read', () => {
  let refuse: (error: unknown) => void
  beforeEach(() => {
    vi.restoreAllMocks()
    useFeedsStore.setState({
      feeds: [{ id: 'f1', unreadPosts: 3 }] as never,
    })
    vi.mocked(feedsApi.readAllAggregate).mockReturnValue(
      new Promise((_resolve, reject) => {
        refuse = reject
      })
    )
  })

  it('clears at once and puts back the count and posts when refused', async () => {
    const error = vi.spyOn(toast, 'error')
    render(
      <I18nProvider i18n={i18n}>
        <FeedsListPage />
      </I18nProvider>
    )
    expect(await screen.findByText('p1 unread')).toBeInTheDocument()

    await markAllRead()
    expect(await screen.findByText('p1 read')).toBeInTheDocument()
    expect(badge()).toBe(0)

    // A new post arrives over the socket while the request is out.
    useFeedsStore.getState().adjustUnread('f1', 1)

    refuse({ response: { status: 500 } })
    expect(await screen.findByText('p1 unread')).toBeInTheDocument()
    expect(badge()).toBe(4)
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith('Failed to mark all as read')
    )
  })
})
