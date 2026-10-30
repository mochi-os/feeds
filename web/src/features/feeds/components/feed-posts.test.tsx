// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
// On the feed page the whole post card navigates to the view-post page on
// click. While the inline edit form is open, that same handler must stand
// down: the form is full of non-interactive targets (attachment tiles, the
// check-in map, whitespace), and a navigation from any of them unmounts the
// form and destroys the draft.
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { FeedPost } from '@/types'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createReactionCounts } from '@/features/feeds/constants'
import { FeedPosts } from './feed-posts'

// Mock navigation
const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  // A post's thread builds its comments' share addresses from the router.
  useRouter: () => ({}),
  // The timestamp permalink renders a Link; there is no router in this test,
  // so it stands in as a plain anchor. The assertions below are about the
  // card's own click handler, not about where the Link points.
  Link: ({ children, ...props }: { children?: ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}))

// Mock feedsApi
vi.mock('@/api/feeds', () => ({
  feedsApi: {
    searchMembers: vi.fn().mockResolvedValue([]),
    hostedAccounts: vi.fn().mockResolvedValue([
      {
        id: 'account-1',
        type: 'fediverse',
        identifier: '@me@example.com',
        name: 'Me',
        server: 'example.com',
        hosted: true,
      },
    ]),
  },
}))

// The card's children each pull their own API/store graph; the behaviour
// under test lives on the card itself, so they render as nothing. The thread
// stands in as what the card hands it for a reply: a draft and a send.
vi.mock('./comment-thread', () => ({
  CommentThread: (props: {
    comment: { id: string; subscriberId: string }
    avatars?: ReadonlyMap<string, string>
    onReplyDraftChange: (value: string) => void
    onSubmitReply: (commentId: string) => void | Promise<void>
  }) => (
    <div>
      <span data-testid='avatar-source'>
        {props.avatars?.get(props.comment.subscriberId)}
      </span>
      <button
        type='button'
        onClick={() => props.onReplyDraftChange('An answer')}
      >
        Type reply
      </button>
      <button
        type='button'
        onClick={() => void props.onSubmitReply(props.comment.id)}
      >
        Send reply
      </button>
    </div>
  ),
}))
vi.mock('./saved-button', () => ({ SavedButton: () => null }))
vi.mock('./post-attachments', () => ({ PostAttachments: () => null }))
vi.mock('./attachment-comments', () => ({ AttachmentComments: () => null }))
// PostTagsTooltip now comes straight from the shared library; override just it
// while keeping every other @mochi/web export real.
vi.mock('@mochi/web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mochi/web')>()
  return { ...actual, PostTagsTooltip: () => null }
})
vi.mock('./reaction-bar', () => ({ ReactionBar: () => null }))

function post(id = 'post-1', body = 'Hello world'): FeedPost {
  return {
    id,
    feedId: 'feed-1',
    feedFingerprint: 'abcdef123',
    author: 'Author',
    role: 'owner',
    created: 1700000000000,
    body,
    reactions: createReactionCounts(),
    comments: [],
    isOwner: true,
  }
}

function renderPosts(
  posts: FeedPost[] = [post()],
  onReplyToComment: (...args: unknown[]) => void = () => {},
  owner = true
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider i18n={i18n}>
        <FeedPosts
          posts={posts}
          commentDrafts={{}}
          onDraftChange={() => {}}
          onAddComment={() => {}}
          onReplyToComment={onReplyToComment}
          onPostReaction={() => {}}
          onCommentReaction={() => {}}
          onEditPost={async () => true}
          onDeletePost={() => {}}
          isFeedOwner={owner}
          isLoggedIn
          currentUserId='user-1'
        />
      </I18nProvider>
    </QueryClientProvider>
  )
}

function card(id = 'post-1'): HTMLElement {
  // The observer wrapper and the Card both carry data-post-id; the Card - the
  // element with the navigate handler - is the inner one.
  const element = document.querySelector<HTMLElement>(
    `[data-post-id="${id}"] [data-post-id="${id}"]`
  )
  expect(element).not.toBeNull()
  return element!
}

/** Enter edit mode the way the user does: More options → Edit. */
async function openEdit(id = 'post-1') {
  const user = userEvent.setup()
  // Scoped to the card, so a second post on screen keeps this unambiguous.
  await user.click(
    within(card(id)).getByRole('button', { name: 'More options' })
  )
  await user.click(await screen.findByText('Edit post'))
  // The edit form is open once the body sits in its textarea.
  const body = id === 'post-1' ? 'Hello world' : 'Second post'
  expect(screen.getByDisplayValue(body)).toBeInTheDocument()
}

/** Opens post-1's editor and types into it, so a draft is genuinely at risk. */
async function openDirtyEdit() {
  await openEdit('post-1')
  fireEvent.change(screen.getByDisplayValue('Hello world'), {
    target: { value: 'Edited but not saved' },
  })
  expect(screen.getByDisplayValue('Edited but not saved')).toBeInTheDocument()
}

describe('FeedPosts card navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('navigates to the post when the card is clicked', () => {
    renderPosts()

    fireEvent.click(card())

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/$feedId/$postId',
      params: { feedId: 'abcdef123', postId: 'post-1' },
    })
  })

  it('stands down while the post is being edited, keeping the draft', async () => {
    renderPosts()
    await openEdit()

    // A click on any non-interactive part of the card - the drag-release of
    // an attachment reorder lands exactly here - must not navigate.
    fireEvent.click(card())

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('Hello world')).toBeInTheDocument()
  })

  // Escape used to drop the edit outright, taking the typed body with it.
  it('asks before Escape drops an edit that has changes', async () => {
    const user = userEvent.setup()
    renderPosts()
    await openEdit()

    const textarea = screen.getByDisplayValue('Hello world')
    await user.clear(textarea)
    await user.type(textarea, 'Changed')

    fireEvent.keyDown(textarea, { key: 'Escape' })

    expect(screen.getByText('Discard draft?')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Changed')).toBeInTheDocument()
  })

  // The other half of the rule: nothing to lose means nothing to confirm.
  it('lets Escape close an edit that has no changes', async () => {
    renderPosts()
    await openEdit()

    fireEvent.keyDown(screen.getByDisplayValue('Hello world'), {
      key: 'Escape',
    })

    expect(screen.queryByText('Discard draft?')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Hello world')).not.toBeInTheDocument()
  })

  // Opening another post's editor replaced the state outright, taking the open
  // draft with it. Both of these are entry points rather than exits, which is
  // why guarding the close paths alone missed them.
  it('asks before editing another post drops an open draft', async () => {
    const user = userEvent.setup()
    renderPosts([post(), post('post-2', 'Second post')])
    await openDirtyEdit()

    await user.click(
      within(card('post-2')).getByRole('button', { name: 'More options' })
    )
    await user.click(await screen.findByText('Edit post'))

    expect(screen.getByText('Discard draft?')).toBeInTheDocument()
    // Still the first post's editor, still holding what was typed.
    expect(screen.getByDisplayValue('Edited but not saved')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Second post')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Discard' }))

    // The armed switch is honoured once the draft is actually gone.
    expect(await screen.findByDisplayValue('Second post')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Edited but not saved')).toBeNull()
  })

  it('asks before navigating away drops an open draft', async () => {
    const user = userEvent.setup()
    renderPosts([post(), post('post-2', 'Second post')])
    await openDirtyEdit()

    fireEvent.click(card('post-2'))

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(screen.getByText('Discard draft?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/$feedId/$postId',
      params: { feedId: 'abcdef123', postId: 'post-2' },
    })
  })

  it('navigates again once the edit is cancelled', async () => {
    renderPosts()
    await openEdit()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByDisplayValue('Hello world')).not.toBeInTheDocument()

    fireEvent.click(card())
    expect(mockNavigate).toHaveBeenCalledTimes(1)
  })

  const copies = [
    {
      address: '@alice@mastodon.social',
      network: 'mastodon',
      remote: '101',
      url: 'https://mastodon.social/@alice/101',
    },
    { address: 'alice.bsky.social', network: 'bluesky', remote: 'at://x', url: '' },
  ]

  it('opens a post\'s copies on other networks from its menu, not a row on the card', async () => {
    const user = userEvent.setup()
    renderPosts([{ ...post(), copies }])
    expect(within(card()).queryByText(/Also on/)).toBeNull()
    await user.click(
      within(card()).getByRole('button', { name: 'More options' })
    )
    const link = await screen.findByRole('menuitem', { name: 'Open on Mastodon' })
    expect(link).toHaveAttribute('href', 'https://mastodon.social/@alice/101')
    expect(link).toHaveAttribute('target', '_blank')
    // A copy with no page has nothing to open.
    expect(screen.queryByRole('menuitem', { name: 'Open on Bluesky' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Edit post' })).toBeTruthy()
  })

  it('gives a reader who cannot manage the post a menu of its copies alone', async () => {
    const user = userEvent.setup()
    renderPosts([{ ...post(), isOwner: false, copies }], () => {}, false)
    await user.click(
      within(card()).getByRole('button', { name: 'More options' })
    )
    expect(
      await screen.findByRole('menuitem', { name: 'Open on Mastodon' })
    ).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Edit post' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Delete post' })).toBeNull()
  })

  // A hosted account's copy is the post on the user's own server, whose link
  // leads straight back to it.
  const hosted = {
    address: '@alice@example.com',
    network: 'fediverse',
    remote: 'https://example.com/~alice/1',
    url: 'https://example.com/~alice/1',
  }

  it('offers no link to a hosted account\'s copy, which is the post itself', async () => {
    const user = userEvent.setup()
    renderPosts([{ ...post(), copies: [hosted, ...copies] }])
    await user.click(
      within(card()).getByRole('button', { name: 'More options' })
    )
    expect(
      await screen.findByRole('menuitem', { name: 'Open on Mastodon' })
    ).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: /ActivityPub|Fediverse/ })).toBeNull()
  })

  it('gives a reader no menu for a post whose only copy is a hosted account\'s', () => {
    renderPosts([{ ...post(), isOwner: false, copies: [hosted] }], () => {}, false)
    expect(
      within(card()).queryByRole('button', { name: 'More options' })
    ).toBeNull()
  })

  it('counts a post\'s boosts beside its reactions', () => {
    renderPosts([{ ...post(), boosts: 3 }])
    const count = within(card()).getByText('Boosted 3 times')
    // In the row of reactions and actions, not under the post's text.
    expect(count.closest('.mt-4')).not.toBeNull()
    expect(within(card()).getByText('3')).toBeTruthy()
  })

  it('folds a post behind its content warning, a strip that opens and closes it in place', () => {
    renderPosts([{ ...post('post-1', 'Spoilers ahead'), warning: 'Film plot' }])
    const strip = screen.getByRole('button', { name: /Film plot/ })
    expect(screen.queryByText('Spoilers ahead')).toBeNull()
    expect(strip).toHaveAttribute('aria-expanded', 'false')
    expect(within(strip).getByText('Show post')).toBeTruthy()

    fireEvent.click(strip)
    expect(screen.getByText('Spoilers ahead')).toBeTruthy()
    expect(strip).toHaveAttribute('aria-expanded', 'true')
    expect(within(strip).getByText('Hide post')).toBeTruthy()
    // Opening the warning does not open the post.
    expect(mockNavigate).not.toHaveBeenCalled()

    fireEvent.click(strip)
    expect(screen.queryByText('Spoilers ahead')).toBeNull()
    expect(within(strip).getByText('Show post')).toBeTruthy()
  })
})

describe('FeedPosts replying to a comment from another network', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // A post published to a hosted fediverse account, with a comment that came
  // back from there.
  function published(): FeedPost {
    return {
      ...post(),
      copies: [
        {
          address: '@me@example.com',
          network: 'fediverse',
          remote: 'https://example.com/~me/1',
          url: '',
        },
      ],
      comments: [
        {
          id: 'comment-1',
          subscriberId: 'https://remote.example/u/bob',
          author: 'Bob',
          created: 1,
          body: 'Nice',
          format: 'html',
          reactions: createReactionCounts(),
          userReaction: null,
          replies: [],
        },
      ],
    }
  }

  // The server sends a comment wherever the post or the comment answered is,
  // so there is nothing to choose before replying.
  it('offers no account to reply from, and sends the reply as written', async () => {
    const user = userEvent.setup()
    const onReplyToComment = vi.fn()
    renderPosts([published()], onReplyToComment)
    await user.click(screen.getByRole('button', { name: 'Comment' }))
    expect(screen.queryByRole('combobox')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Type reply' }))
    await user.click(screen.getByRole('button', { name: 'Send reply' }))
    expect(onReplyToComment).toHaveBeenCalledWith(
      'feed-1',
      'post-1',
      'comment-1',
      'An answer',
      undefined
    )
  })
})

// A commenter's avatar route names one of their comments, so a page that
// built each comment's own address fetched the same picture once per comment.
describe('FeedPosts commenter avatars', () => {
  function commented(id: string, feedId: string, by: string[]): FeedPost {
    return {
      ...post(id),
      feedId,
      comments: by.map((subscriberId, n) => ({
        id: `${id}-comment-${n}`,
        subscriberId,
        author: subscriberId,
        created: 1,
        body: 'Nice',
        reactions: createReactionCounts(),
        userReaction: null,
        replies: [],
      })),
    }
  }

  it('builds every comment by one person from their first comment on the page', () => {
    renderPosts([
      commented('post-1', 'feed-1', ['ann', 'bob']),
      commented('post-2', 'feed-2', ['bob', 'ann']),
    ])
    expect(
      screen.getAllByTestId('avatar-source').map((span) => span.textContent)
    ).toEqual([
      '/feed-1/-/post-1/post-1-comment-0/asset',
      '/feed-1/-/post-1/post-1-comment-1/asset',
      '/feed-1/-/post-1/post-1-comment-1/asset',
      '/feed-1/-/post-1/post-1-comment-0/asset',
    ])
  })
})
