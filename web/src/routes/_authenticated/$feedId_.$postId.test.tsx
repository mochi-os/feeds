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

const { view, createComment, reactToComment } = vi.hoisted(() => ({
  view: vi.fn(),
  createComment: vi.fn().mockResolvedValue({ data: {} }),
  reactToComment: vi.fn(),
}))

vi.mock('@/api/feeds', () => ({
  feedsApi: { view, createComment, reactToComment },
}))
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
// The post list stands in as the two ways to answer, passing an account as
// the list did when it offered a choice of one.
vi.mock('@/features/feeds/components/feed-posts', () => ({
  FeedPosts: (props: {
    posts: Array<{ comments: Array<{ reactions: { like: number } }> }>
    onAddComment: (...args: unknown[]) => Promise<void>
    onReplyToComment: (...args: unknown[]) => Promise<void>
    onCommentReaction: (...args: unknown[]) => Promise<void>
  }) => (
    <div>
      <button
        type='button'
        onClick={() =>
          void props.onCommentReaction('feed-1', 'post-1', 'comment-1', 'like')
        }
      >
        Like
      </button>
      <span>likes {props.posts[0]?.comments[0]?.reactions.like ?? '-'}</span>
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

describe('The single post page answering a post', () => {
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

  // The server sends a comment wherever the post or the comment answered is,
  // from the commenter's own account, so the page names none.
  it('sends a comment on the post as written, naming no account', async () => {
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Comment' }))
    await waitFor(() =>
      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'A comment' })
      )
    )
    expect(createComment.mock.calls[0][0]).not.toHaveProperty('account')
  })

  it('sends a reply to a comment as written, naming no account', async () => {
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Reply' }))
    await waitFor(() =>
      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({ parent: 'comment-1', body: 'An answer' })
      )
    )
    expect(createComment.mock.calls[0][0]).not.toHaveProperty('account')
  })
})

describe('The single post page reacting to a comment', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
    view.mockClear()
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
            comments: [
              {
                id: 'comment-1',
                subscriberId: 's',
                author: 'A',
                created: 0,
                body: 'Hi',
                reactions: createReactionCounts({ like: 1 }),
                userReaction: null,
              },
            ],
          },
        ],
      },
    })
  })

  it('shows the reaction before the server answers', async () => {
    let refuse: (error: unknown) => void = () => {}
    reactToComment.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          refuse = reject
        })
    )
    show()
    expect(await screen.findByText('likes 1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Like' }))
    expect(await screen.findByText('likes 2')).toBeInTheDocument()

    refuse(new Error('refused'))
    expect(await screen.findByText('likes 1')).toBeInTheDocument()
    // A refusal fetches nothing more, as before.
    expect(view).toHaveBeenCalledTimes(1)
  })

  it('fetches the post again once the server takes it, as before', async () => {
    reactToComment.mockResolvedValue({ data: {} })
    show()
    await screen.findByText('likes 1')
    fireEvent.click(screen.getByRole('button', { name: 'Like' }))
    await waitFor(() => expect(view).toHaveBeenCalledTimes(2))
  })
})
