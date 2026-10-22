// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
// The inline thread cuts replies past the depth limit with "Continue this
// thread", which navigates. The image viewer's panel never does: the viewer
// keeps its open state to itself and does not follow a navigation, so the
// thread would change behind it. Forums keeps its panel out the same way.
import type { FeedPost } from '@/types'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { useCommentThread } from '@mochi/web'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { createReactionCounts } from '@/features/feeds/constants'
import { AttachmentComments } from './attachment-comments'
import { PostCommentsList, type PostCommentsListProps } from './feed-posts'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useRouter: () => ({}),
  Link: () => null,
}))
vi.mock('@/api/feeds', () => ({ feedsApi: {} }))
// Each comment reports whether its thread would cut deep replies.
vi.mock('./comment-thread', () => ({
  CommentThread: () => {
    const { onContinue } = useCommentThread()
    return <span>{onContinue ? 'cuts' : 'never cuts'}</span>
  },
}))

const post = {
  id: 'p1',
  feedId: 'f1',
  author: 'Author',
  role: 'owner',
  created: 0,
  body: '',
  reactions: createReactionCounts(),
  comments: [
    {
      id: 'c1',
      subscriberId: 's1',
      author: 'A',
      created: 0,
      body: 'on the image',
      reactions: createReactionCounts(),
      attachment: 'img1',
    },
  ],
} as unknown as FeedPost

const thread: PostCommentsListProps = {
  post,
  isExpanded: true,
  onExpand: () => {},
  replyingTo: null,
  replyDraft: '',
  onStartReply: () => {},
  onCancelReply: () => {},
  onReplyDraftChange: () => {},
  onSubmitReply: () => {},
  onReact: () => {},
  onSearchPeople: async () => [],
  canReact: true,
  canComment: true,
  canManageComments: false,
}

function wrap(node: React.ReactNode) {
  return render(<I18nProvider i18n={i18n}>{node}</I18nProvider>)
}

describe('the depth cut in feeds', () => {
  it('applies to the inline thread', () => {
    wrap(<PostCommentsList {...thread} />)
    expect(screen.getByText('cuts')).toBeTruthy()
  })

  it('stays out of the image viewer panel', () => {
    wrap(<AttachmentComments attachmentId='img1' thread={thread} canComment />)
    expect(screen.getByText('never cuts')).toBeTruthy()
  })
})
