// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LookupResult, looksUpElsewhere } from './lookup-result'
import { useFeedsStore } from '@/stores/feeds-store'

const state = vi.hoisted(() => ({
  lookup: vi.fn(),
  addSource: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/api/feeds', () => ({
  feedsApi: { lookup: state.lookup, addSource: state.addSource },
}))

vi.mock('@mochi/web', async (original) => ({
  ...(await original<typeof import('@mochi/web')>()),
  toast: { success: state.success, error: state.error },
}))

function show(query: string) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <LookupResult query={query} />
      </I18nProvider>
    </QueryClientProvider>
  )
}

describe('looksUpElsewhere', () => {
  it('recognises handles, identifiers and links, not names or Mochi links', () => {
    for (const query of [
      '@alice@mastodon.social',
      'alice@mastodon.social',
      '!technology@lemmy.world',
      'alice.bsky.social',
      'did:plc:ewvi7nxzyoun6zhxrhs64oiz',
      'https://mastodon.social/@alice/1',
    ]) {
      expect(looksUpElsewhere(query), query).toBe(true)
    }
    for (const query of [
      'alice',
      'two words',
      'mochi://peer/entity',
      'https://example.com/feeds/abc',
      '',
    ]) {
      expect(looksUpElsewhere(query), query).toBe(false)
    }
  })
})

describe('LookupResult', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
    state.lookup.mockReset()
    state.addSource.mockReset()
    state.success.mockReset()
    state.error.mockReset()
    useFeedsStore.setState({
      feeds: [
        { id: 'f1', name: 'Mine', isOwner: true },
        { id: 'f2', name: 'Theirs', isOwner: false },
      ] as never,
    })
  })

  it('shows a person with their network and follows them into an owned feed', async () => {
    state.lookup.mockResolvedValue({
      kind: 'person',
      network: 'fediverse',
      id: 'https://mastodon.social/users/alice',
      name: 'Alice',
      address: '@alice@mastodon.social',
      avatar: '',
      url: 'https://mastodon.social/@alice',
    })
    state.addSource.mockResolvedValue({ data: { ingested: 2 } })
    const user = userEvent.setup()
    show('@alice@mastodon.social')
    expect(await screen.findByText('Alice')).toBeTruthy()
    expect(
      screen.getByText('@alice@mastodon.social · Fediverse')
    ).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Follow' }))
    // Only the feeds the user owns take a source.
    const mine = await screen.findByRole('menuitem', { name: 'Mine' })
    expect(screen.queryByRole('menuitem', { name: 'Theirs' })).toBeNull()
    await user.click(mine)
    await waitFor(() =>
      expect(state.addSource).toHaveBeenCalledWith(
        'f1',
        'person',
        'https://mastodon.social/users/alice'
      )
    )
    expect(state.success).toHaveBeenCalledWith(
      'Source added (2 posts imported)'
    )
  })

  it('shows a community as one', async () => {
    state.lookup.mockResolvedValue({
      kind: 'group',
      network: 'fediverse',
      id: 'https://lemmy.world/c/technology',
      name: 'Technology',
      address: '@technology@lemmy.world',
    })
    show('!technology@lemmy.world')
    expect(await screen.findByText('Technology')).toBeTruthy()
    expect(
      screen.getByText('@technology@lemmy.world · Fediverse · Community')
    ).toBeTruthy()
  })

  it('shows a post as its quote, with the author to follow', async () => {
    state.lookup.mockResolvedValue({
      kind: 'post',
      network: 'bluesky',
      quote: {
        network: 'bluesky',
        url: 'https://bsky.app/profile/bob.bsky.social/post/3abc',
        text: 'Hi there',
        author: {
          id: 'did:plc:ewvi7nxzyoun6zhxrhs64oiz',
          name: 'Bob',
          address: '@bob.bsky.social',
          url: 'https://bsky.app/profile/bob.bsky.social',
        },
      },
    })
    show('https://bsky.app/profile/bob.bsky.social/post/3abc')
    expect(await screen.findByText('Hi there')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Follow Bob' })).toBeTruthy()
  })

  it('looks nothing up for a plain name', async () => {
    show('alice')
    await act(async () => {})
    expect(state.lookup).not.toHaveBeenCalled()
    expect(screen.queryByTestId('lookup-result')).toBeNull()
  })
})
