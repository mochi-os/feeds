// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
// The single post page's comment and reply handlers carry the account the
// commenter chose to answer from to the request, as the feed pages do.
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createReactionCounts } from '@/features/feeds/constants'

const { view, createComment } = vi.hoisted(() => ({
  view: vi.fn(),
  createComment: vi.fn().mockResolvedValue({ data: {} }),
}))

vi.mock('@/api/feeds', () => ({ feedsApi: { view, createComment } }))
vi.mock('@/api/adapters', () => ({
  mapPosts: (posts?: unknown[]) => posts ?? [],
}))
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => ({ feedId: 'feed-1', postId: 'post-1' }),
    useSearch: () => ({}),
  }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}))
vi.mock('@/context/sidebar-context', () => ({
  useSidebarContext: () => ({ setFeedId: () => {} }),
}))
vi.mock('@/hooks/useFeedWebsocket', () => ({ useFeedWebsocket: () => {} }))
vi.mock('@mochi/web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mochi/web')>()
  return {
    ...actual,
    Main: ({ children }: { children?: ReactNode }) => <main>{children}</main>,
    PageHeader: () => null,
    usePageTitle: () => {},
  }
})
// The post list stands in as the two ways to answer from an account.
vi.mock('@/features/feeds/components/feed-posts', () => ({
  FeedPosts: (props: {
    onAddComment: (...args: unknown[]) => Promise<void>
    onReplyToComment: (...args: unknown[]) => Promise<void>
  }) => (
    <div>
      <button
        type='button'
        onClick={() =>
          void props.onAddComment(
            'feed-1',
            'post-1',
            'A comment',
            undefined,
            undefined,
            'account-1'
          )
        }
      >
        Comment
      </button>
      <button
        type='button'
        onClick={() =>
          void props.onReplyToComment(
            'feed-1',
            'post-1',
            'comment-1',
            'An answer',
            undefined,
            'account-1'
          )
        }
      >
        Reply
      </button>
    </div>
  ),
}))

const { Route } = await import('./$feedId_.$postId')

function show() {
  const Page = (Route as unknown as { component: () => ReactNode }).component
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <I18nProvider i18n={i18n}>
        <Page />
      </I18nProvider>
    </QueryClientProvider>
  )
}

describe('The single post page answering from an account', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
    createComment.mockClear()
    view.mockResolvedValue({
      data: {
        feed: { name: 'Feed' },
        posts: [
          {
            id: 'post-1',
            feedId: 'feed-1',
            author: 'Feed',
            role: 'owner',
            created: 0,
            body: 'Hello',
            reactions: createReactionCounts(),
            comments: [],
          },
        ],
      },
    })
  })

  it('sends a comment on the post with the account chosen', async () => {
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Comment' }))
    await waitFor(() =>
      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'A comment', account: 'account-1' })
      )
    )
  })

  it('sends a reply to a comment with the account chosen', async () => {
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Reply' }))
    await waitFor(() =>
      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          parent: 'comment-1',
          body: 'An answer',
          account: 'account-1',
        })
      )
    )
  })
})
