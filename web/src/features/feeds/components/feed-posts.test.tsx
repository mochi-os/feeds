// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

/* eslint-disable lingui/no-unlocalized-strings */
// On the feed page the whole post card navigates to the view-post page on
// click. While the inline edit form is open, that same handler must stand
// down: the form is full of non-interactive targets (attachment tiles, the
// check-in map, whitespace), and a navigation from any of them unmounts the
// form and destroys the draft.
import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@lingui/react'
import { i18n } from '@lingui/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FeedPosts } from './feed-posts'
import { createReactionCounts } from '@/features/feeds/constants'
import type { FeedPost } from '@/types'

// Mock navigation
const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
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
  },
}))

// The card's children each pull their own API/store graph; the behaviour
// under test lives on the card itself, so they render as nothing.
vi.mock('./comment-thread', () => ({ CommentThread: () => null }))
vi.mock('./saved-button', () => ({ SavedButton: () => null }))
vi.mock('./post-attachments', () => ({ PostAttachments: () => null }))
vi.mock('./attachment-comments', () => ({ AttachmentComments: () => null }))
vi.mock('./post-tags', () => ({ PostTagsTooltip: () => null }))
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

function renderPosts(posts: FeedPost[] = [post()]) {
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
        onReplyToComment={() => {}}
        onPostReaction={() => {}}
        onCommentReaction={() => {}}
        onEditPost={async () => true}
        onDeletePost={() => {}}
        isFeedOwner
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
})
