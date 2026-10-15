// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddSourceDialog, type SourceKind } from './$feedId_.sources'

const state = vi.hoisted(() => ({
  addSource: vi.fn(),
  blueskyAccounts: vi.fn(),
  hostedAccounts: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/api/feeds', () => ({
  feedsApi: {
    addSource: state.addSource,
    blueskyAccounts: state.blueskyAccounts,
    hostedAccounts: state.hostedAccounts,
    getPublish: vi.fn().mockResolvedValue({ accounts: [], publish: [], copies: {} }),
    updateSource: vi.fn(),
  },
}))

vi.mock('@mochi/web', async (original) => ({
  ...(await original<typeof import('@mochi/web')>()),
  toast: { success: state.success, error: state.error },
}))

// Radix's Select reaches for pointer capture and scrolling, which jsdom lacks.
Element.prototype.hasPointerCapture = () => false
Element.prototype.releasePointerCapture = () => {}
Element.prototype.scrollIntoView = () => {}

const bluesky = [
  { id: 'b1', type: 'bluesky', identifier: 'alice.bsky.social', name: '', server: 'bsky.social' },
  { id: 'b2', type: 'bluesky', identifier: 'alice.example.com', name: '', server: 'example.com', hosted: true },
]

function show(sourceType: SourceKind) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const onAdded = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <I18nProvider i18n={i18n}>
        <AddSourceDialog
          open
          onOpenChange={() => {}}
          feedId='f1'
          onAdded={onAdded}
          sourceType={sourceType}
        />
      </I18nProvider>
    </QueryClientProvider>
  )
  return onAdded
}

describe('Add source dialog', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
    state.addSource.mockReset().mockResolvedValue({ data: { ingested: 2 } })
    state.blueskyAccounts.mockReset().mockResolvedValue(bluesky)
    state.hostedAccounts.mockReset().mockResolvedValue([])
    state.success.mockReset()
    state.error.mockReset()
  })

  it('adds a Bluesky feed or list by its link, read through the account chosen', async () => {
    const user = userEvent.setup()
    const onAdded = show('bluesky')
    expect(screen.getByText('Add Bluesky feed or list')).toBeTruthy()
    // Two accounts on Bluesky: the dialog asks which reads the feed.
    await user.click(await screen.findByRole('combobox', { name: 'Read with' }))
    await user.click(await screen.findByRole('option', { name: 'alice.example.com' }))
    fireEvent.change(screen.getByPlaceholderText(/bsky.app\/profile/), {
      target: { value: 'https://bsky.app/profile/alice.bsky.social/feed/picks' },
    })
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(state.addSource).toHaveBeenCalledWith(
        'f1',
        'bluesky',
        'https://bsky.app/profile/alice.bsky.social/feed/picks',
        undefined,
        undefined,
        'b2'
      )
    )
    expect(state.success).toHaveBeenCalledWith('Source added (2 posts imported)')
    expect(onAdded).toHaveBeenCalled()
  })

  it('names no account where the owner has one on Bluesky', async () => {
    state.blueskyAccounts.mockResolvedValue([bluesky[0]])
    const user = userEvent.setup()
    show('bluesky')
    await waitFor(() => expect(state.blueskyAccounts).toHaveBeenCalled())
    expect(screen.queryByRole('combobox', { name: 'Read with' })).toBeNull()
    fireEvent.change(screen.getByPlaceholderText(/bsky.app\/profile/), {
      target: { value: 'at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/app.bsky.graph.list/1' },
    })
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(state.addSource).toHaveBeenCalledWith(
        'f1',
        'bluesky',
        'at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/app.bsky.graph.list/1',
        undefined,
        undefined,
        undefined
      )
    )
  })
})
