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
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

function post(): FeedPost {
  return {
    id: 'post-1',
    feedId: 'feed-1',
    feedFingerprint: 'abcdef123',
    author: 'Author',
    role: 'owner',
    created: 1700000000000,
    body: 'Hello world',
    reactions: createReactionCounts(),
    comments: [],
    isOwner: true,
  }
}

function renderPosts() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider i18n={i18n}>
      <FeedPosts
        posts={[post()]}
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

function card(): HTMLElement {
  // The observer wrapper and the Card both carry data-post-id; the Card - the
  // element with the navigate handler - is the inner one.
  const element = document.querySelector<HTMLElement>(
    '[data-post-id="post-1"] [data-post-id="post-1"]'
  )
  expect(element).not.toBeNull()
  return element!
}

/** Enter edit mode the way the user does: More options → Edit. */
async function openEdit() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'More options' }))
  await user.click(await screen.findByText('Edit post'))
  // The edit form is open once the body sits in its textarea.
  expect(screen.getByDisplayValue('Hello world')).toBeInTheDocument()
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

  it('navigates again once the edit is cancelled', async () => {
    renderPosts()
    await openEdit()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByDisplayValue('Hello world')).not.toBeInTheDocument()

    fireEvent.click(card())
    expect(mockNavigate).toHaveBeenCalledTimes(1)
  })
})
