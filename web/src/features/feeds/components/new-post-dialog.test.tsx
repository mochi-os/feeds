// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
// Where a new post also goes is the last thing chosen before posting, below
// what the post says and carries: one line naming the feed's accounts it goes
// to, which opens into a switch per account for this post alone.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { FeedSummary } from '@/types'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NewPostDialog } from './new-post-dialog'

vi.mock('@/api/feeds', () => ({
  feedsApi: {
    searchMembers: vi.fn().mockResolvedValue([]),
    getPublish: vi.fn().mockResolvedValue({
      accounts: [
        {
          id: 'account-1',
          type: 'fediverse',
          identifier: '@me@example.com',
          name: 'Me',
          server: 'example.com',
          hosted: true,
        },
      ],
      publish: ['account-1'],
    }),
  },
}))

const feed = {
  id: 'feed-1',
  name: 'Test feed',
  privacy: 'public',
} as FeedSummary

describe('NewPostDialog publishing', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
  })

  const open = (onSubmit = vi.fn()) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <I18nProvider i18n={i18n}>
          <NewPostDialog
            feeds={[feed]}
            onSubmit={onSubmit}
            open
            onOpenChange={() => {}}
            hideTrigger
          />
        </I18nProvider>
      </QueryClientProvider>
    )
    return onSubmit
  }

  it('offers where the post also goes last, below its content and attachments', async () => {
    open()
    const line = await screen.findByRole('button', { name: /Also post to/ })
    for (const above of [
      screen.getByLabelText('Post content'),
      screen.getByText('Add files'),
    ]) {
      expect(
        above.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    }
    expect(screen.queryByText('Publish to')).toBeNull()
    expect(line.textContent).toContain('@me@example.com')
    expect(screen.queryByRole('switch', { name: '@me@example.com' })).toBeNull()
    fireEvent.click(line)
    expect(
      screen
        .getByRole('switch', { name: '@me@example.com' })
        .getAttribute('aria-checked')
    ).toBe('true')
  })

  it('sends the accounts chosen for this post alone', async () => {
    const onSubmit = open()
    fireEvent.click(await screen.findByRole('button', { name: /Also post to/ }))
    fireEvent.click(screen.getByRole('switch', { name: '@me@example.com' }))
    fireEvent.change(screen.getByLabelText('Post content'), {
      target: { value: 'Hello' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].accounts).toEqual([])
  })
})
