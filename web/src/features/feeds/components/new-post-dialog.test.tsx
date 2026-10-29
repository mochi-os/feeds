// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
// Where a new post goes out is the last thing chosen before posting, below
// what the post says and carries.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { FeedSummary } from '@/types'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen } from '@testing-library/react'
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

  it('offers where the post goes out last, below its content and attachments', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <I18nProvider i18n={i18n}>
          <NewPostDialog
            feeds={[feed]}
            onSubmit={() => {}}
            open
            onOpenChange={() => {}}
            hideTrigger
          />
        </I18nProvider>
      </QueryClientProvider>
    )
    const publish = await screen.findByText('Publish to')
    for (const above of [
      screen.getByLabelText('Post content'),
      screen.getByText('Add files'),
    ]) {
      expect(
        above.compareDocumentPosition(publish) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    }
    expect(screen.getByRole('switch', { name: '@me@example.com' })).toBeTruthy()
  })
})
