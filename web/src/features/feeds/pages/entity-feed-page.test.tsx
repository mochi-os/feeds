// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Feed, FeedPost } from '@/types'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { useAuthStore } from '@mochi/web'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFeedsStore } from '@/stores/feeds-store'
import { prefetchPosts } from '@/hooks/use-infinite-posts'
import { EntityFeedPage } from './entity-feed-page'

const state = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/api/feeds', () => ({
  feedsApi: {
    get: state.get,
    clearNotifications: vi.fn().mockResolvedValue(undefined),
  },
}))
// The posts arrive in the page's shape already.
vi.mock('@/api/adapters', () => ({
  mapPosts: (posts?: unknown[]) => posts ?? [],
  mapFeedsToSummaries: () => [],
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: vi.fn() }),
}))

vi.mock('@/hooks', async (original) => ({
  ...(await original<typeof import('@/hooks')>()),
  useFeedWebsocket: vi.fn(),
  useMarkAsRead: () => ({ markRead: vi.fn() }),
  usePostActions: () => ({ handlePostReaction: vi.fn() }),
  useCommentActions: () => ({}),
  useReadOnScroll: () => ({ observePost: vi.fn() }),
}))
vi.mock('../hooks', () => ({ usePostHandlers: () => ({}) }))
vi.mock('@/context/sidebar-context', () => ({
  useSidebarContext: () => ({ setFeedId: vi.fn(), openNewPostDialog: vi.fn() }),
}))
vi.mock('@/components/options-menu', () => ({ OptionsMenu: () => null }))
vi.mock('@/features/feeds/components/feed-gone', () => ({
  FeedGone: () => null,
}))
vi.mock('../components/feed-banner', () => ({ FeedBanner: () => null }))
vi.mock('../components/follow-button', () => ({ FollowButton: () => null }))
vi.mock('../components/feed-posts', () => ({
  FeedPosts: ({ posts }: { posts: FeedPost[] }) => (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.id}</li>
      ))}
    </ul>
  ),
}))

vi.mock('@mochi/web', async (original) => ({
  ...(await original<typeof import('@mochi/web')>()),
  PageHeader: () => null,
  SortSelector: () => null,
  LoadMoreTrigger: () => null,
  Main: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))

const feed = { id: 'f1', fingerprint: 'fp', name: 'Feed' } as Feed

beforeEach(() => {
  state.get.mockReset()
  state.get.mockResolvedValue({
    data: { posts: [{ id: 'p1' }], hasMore: false },
  })
  useAuthStore.setState({ isAuthenticated: true })
  useFeedsStore.setState({ defaultSort: '' })
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

describe('feed page', () => {
  it('shows the first page its loader started, without asking again', async () => {
    const queries = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    // As the loader asks: the page's own list, in the sort it opens in.
    const prefetched = prefetchPosts(queries, {
      feedId: 'f1',
      entityContext: true,
      sort: 'interests',
      unread: false,
    })
    await waitFor(() => expect(prefetched?.data).toBeDefined())

    render(
      <QueryClientProvider client={queries}>
        <I18nProvider i18n={i18n}>
          <EntityFeedPage feed={feed} prefetched={prefetched} />
        </I18nProvider>
      </QueryClientProvider>
    )

    expect(await screen.findByText('p1')).toBeTruthy()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(state.get).toHaveBeenCalledTimes(1)
  })
})
