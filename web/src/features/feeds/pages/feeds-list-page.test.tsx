// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { useAuthStore } from '@mochi/web'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { feedsApi } from '@/api/feeds'
import type { FeedsAnswer } from '@/hooks/use-feeds'
import { FeedsListPage } from './feeds-list-page'

vi.mock('@/api/feeds', () => ({
  feedsApi: {
    view: vi.fn(),
    getAll: vi.fn(),
  },
}))

vi.mock('@/hooks', async (original) => ({
  ...(await original<typeof import('@/hooks')>()),
  useFeedsWebsocket: vi.fn(),
  useMarkAsRead: () => ({ markRead: vi.fn() }),
  usePostActions: () => ({ handlePostReaction: vi.fn() }),
  useCommentActions: () => ({}),
  useReadOnScroll: () => ({ observePost: vi.fn() }),
}))
vi.mock('../hooks', () => ({ usePostHandlers: () => ({}) }))
vi.mock('@/hooks/use-feeds-storage', () => ({ setLastFeed: vi.fn() }))
vi.mock('@/context/sidebar-context', () => ({
  useSidebarContext: () => ({
    postRefreshHandler: { current: null },
    openCreateFeedDialog: vi.fn(),
  }),
}))
vi.mock('@/components/options-menu', () => ({ OptionsMenu: () => null }))
vi.mock('../components/feed-posts', () => ({ FeedPosts: () => null }))
vi.mock('../components/inline-feed-search', () => ({
  InlineFeedSearch: () => null,
}))
vi.mock('../components/recommended-feeds', () => ({
  RecommendedFeeds: () => null,
}))

vi.mock('@mochi/web', async (original) => ({
  ...(await original<typeof import('@mochi/web')>()),
  PageHeader: () => null,
  SortSelector: () => null,
  LoadMoreTrigger: () => null,
  Main: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))

beforeEach(() => {
  vi.mocked(feedsApi.view).mockReset()
  vi.mocked(feedsApi.view).mockResolvedValue({ data: { feeds: [] } })
  vi.mocked(feedsApi.getAll).mockResolvedValue({
    data: { posts: [], hasMore: false },
  })
  useAuthStore.setState({ isAuthenticated: true })
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

describe('timeline', () => {
  it('loads its feed list from the answer the route loader handed it', async () => {
    const initial: FeedsAnswer = {
      data: { feeds: [{ id: 'a', name: 'A', fingerprint: 'a' }] } as never,
    }

    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <I18nProvider i18n={i18n}>
          <FeedsListPage initial={initial} />
        </I18nProvider>
      </QueryClientProvider>
    )
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(feedsApi.view).not.toHaveBeenCalled()
  })
})
