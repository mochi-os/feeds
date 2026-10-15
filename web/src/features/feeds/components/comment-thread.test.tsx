// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { FeedComment } from '@/types'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createReactionCounts } from '@/features/feeds/constants'
import { CommentThread } from './comment-thread'

// A comment by a person on another network: their own id as the author,
// their page there, and the body as HTML cleaned on arrival.
const outsider: FeedComment = {
  id: 'c1',
  subscriberId: 'https://remote.example/u/bob',
  author: 'Bob',
  page: 'https://remote.example/@bob',
  created: 1,
  body: '<p>Nice <b>post</b><script>alert(1)</script></p>',
  format: 'html',
  reactions: createReactionCounts(),
  userReaction: null,
  replies: [],
}

function show(
  comment: FeedComment,
  props: Partial<Parameters<typeof CommentThread>[0]> = {}
) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <I18nProvider i18n={i18n}>
        <CommentThread
          comment={comment}
          feedId='f1'
          postId='p1'
          replyingTo={null}
          replyDraft=''
          onStartReply={() => {}}
          onCancelReply={() => {}}
          onReplyDraftChange={() => {}}
          onSubmitReply={() => {}}
          onReact={() => {}}
          {...props}
        />
      </I18nProvider>
    </QueryClientProvider>
  )
}

describe('CommentThread with a person from another network', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
  })

  it('links the name to their page and shows the body as cleaned HTML', () => {
    show(outsider)
    const name = screen.getByRole('link', { name: 'Bob' })
    expect(name.getAttribute('href')).toBe('https://remote.example/@bob')
    expect(screen.getByText('post').tagName).toBe('B')
    expect(document.querySelector('script')).toBeNull()
  })

  it('offers the owner mute, block and report, each confirmed', async () => {
    const onModerate = vi.fn()
    show(outsider, { canManageComments: true, onModerate })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mute Bob' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mute' }))
    })
    expect(onModerate).toHaveBeenCalledWith('c1', 'mute')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Report Bob' }))
    })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Reason'), {
        target: { value: 'Spam' },
      })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Report' }))
    })
    expect(onModerate).toHaveBeenCalledWith('c1', 'report', 'Spam')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Block Bob' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Block' }))
    })
    expect(onModerate).toHaveBeenCalledWith('c1', 'block')
  })

  it('offers no moderation to a reader, nor on a Mochi member', () => {
    const onModerate = vi.fn()
    show(outsider, { canManageComments: false, onModerate })
    expect(screen.queryByRole('button', { name: 'Mute Bob' })).toBeNull()
    show(
      {
        ...outsider,
        id: 'c2',
        subscriberId: '1' + 'x'.repeat(49),
        page: undefined,
        format: undefined,
        body: 'Hello',
      },
      { canManageComments: true, onModerate }
    )
    expect(screen.queryByRole('button', { name: 'Block Bob' })).toBeNull()
    expect(screen.getByText('Hello')).toBeTruthy()
  })
})
