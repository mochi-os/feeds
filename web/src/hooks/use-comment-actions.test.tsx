// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ReactNode } from 'react'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCommentActions } from './use-comment-actions'

const { createComment } = vi.hoisted(() => ({
  createComment: vi.fn().mockResolvedValue({ data: {} }),
}))

vi.mock('@/api/feeds', () => ({ feedsApi: { createComment } }))

function actions() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nProvider i18n={i18n}>{children}</I18nProvider>
  )
  return renderHook(
    () =>
      useCommentActions({
        setFeeds: () => {},
        setPostsByFeed: () => {},
        currentUserId: 'user-1',
        currentUserName: 'Me',
        commentDrafts: {},
        setCommentDrafts: () => {},
      }),
    { wrapper }
  ).result
}

describe('useCommentActions', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
    createComment.mockClear()
  })

  it('sends a reply to a comment with the account it also goes out from', async () => {
    const result = actions()
    await act(() =>
      result.current.handleReplyToComment(
        'feed-1',
        'post-1',
        'comment-1',
        'An answer',
        undefined,
        'account-1'
      )
    )
    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        feed: 'feed-1',
        post: 'post-1',
        parent: 'comment-1',
        body: 'An answer',
        account: 'account-1',
      })
    )
  })

  it('sends a comment on the post with the account it also goes out from', async () => {
    const result = actions()
    await act(() =>
      result.current.handleAddComment(
        'feed-1',
        'post-1',
        'A comment',
        undefined,
        undefined,
        'account-1'
      )
    )
    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'A comment', account: 'account-1' })
    )
  })
})
