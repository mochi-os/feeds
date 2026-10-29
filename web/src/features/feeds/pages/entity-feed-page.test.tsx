// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Feed } from '@/types'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { toast } from '@mochi/web'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { feedsApi } from '@/api/feeds'
import { useFeedsStore } from '@/stores/feeds-store'
import { EntityFeedPage } from './entity-feed-page'

// Held at module level: the page copies these on every change of identity.
const { posts } = vi.hoisted(() => ({
  posts: [{ id: 'p1', feedId: 'f1', read: 0 }],
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useRouter: () => ({ invalidate: vi.fn() }),
}))
vi.mock('@/api/feeds', () => ({
  feedsApi: { readAll: vi.fn(), clearNotifications: vi.fn() },
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
  useInfinitePosts: () => ({
    posts,
    permissions: undefined,
    hasAi: false,
    isLoading: false,
    error: null,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
    refetch: async () => {},
    reload: async () => {},
    seen: undefined,
  }),
  useFeedWebsocket: () => {},
  useMarkAsRead: () => ({ markRead: vi.fn() }),
  useReadOnScroll: () => ({ observePost: vi.fn() }),
  usePostActions: () => ({ handlePostReaction: vi.fn() }),
  useCommentActions: () => ({}),
}))
vi.mock('../hooks', () => ({ usePostHandlers: () => ({}) }))
vi.mock('@/context/sidebar-context', () => ({
  useSidebarContext: () => ({
    setFeedId: () => {},
    openNewPostDialog: vi.fn(),
  }),
}))
vi.mock('@/components/options-menu', () => ({ OptionsMenu: () => null }))
vi.mock('@/features/feeds/components/feed-gone', () => ({
  FeedGone: () => null,
}))
vi.mock('../components/feed-banner', () => ({ FeedBanner: () => null }))
vi.mock('../components/follow-button', () => ({ FollowButton: () => null }))
vi.mock('../components/feed-posts', () => ({ FeedPosts: () => null }))

const feed = {
  id: 'f1',
  fingerprint: 'fp1',
  name: 'News',
  owner: 0,
  subscribers: 1,
  populated: 1,
} as unknown as Feed

const badge = () =>
  useFeedsStore.getState().feeds.find((entry) => entry.id === 'f1')?.unreadPosts

// Mark all read clears the feed's badge on the click. A refusal adds the old
// count back rather than setting it, so a post that arrived meanwhile counts.
describe('EntityFeedPage Mark all read', () => {
  let refuse: (error: unknown) => void
  beforeEach(() => {
    vi.restoreAllMocks()
    useFeedsStore.setState({
      feeds: [{ id: 'f1', unreadPosts: 3 }] as never,
    })
    vi.mocked(feedsApi.clearNotifications).mockResolvedValue(undefined as never)
    vi.mocked(feedsApi.readAll).mockReturnValue(
      new Promise((_resolve, reject) => {
        refuse = reject
      })
    )
  })

  it('clears the badge at once and adds it back when refused', async () => {
    const error = vi.spyOn(toast, 'error')
    const user = userEvent.setup()
    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={new QueryClient()}>
          <EntityFeedPage feed={feed} />
        </QueryClientProvider>
      </I18nProvider>
    )

    // The header draws its actions once per layout.
    await user.click((await screen.findAllByRole('button', { name: 'All' }))[0])
    await user.click(
      await screen.findByRole('menuitem', { name: 'Mark all read' })
    )
    expect(badge()).toBe(0)
    expect(feedsApi.readAll).toHaveBeenCalledWith('fp1')

    // A new post arrives over the socket while the request is out.
    useFeedsStore.getState().adjustUnread('f1', 1)

    refuse({ response: { status: 500 } })
    await waitFor(() => expect(badge()).toBe(4))
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith('Failed to mark all as read')
    )
  })
})
