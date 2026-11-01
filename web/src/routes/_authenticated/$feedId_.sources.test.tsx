// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Source } from '@/types'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AddSourceDialog,
  SourcesPanel,
  SourceType,
  type SourceKind,
} from './$feedId_.sources'

const state = vi.hoisted(() => ({
  addSource: vi.fn(),
  importFollows: vi.fn(),
  getSources: vi.fn(),
  blueskyAccounts: vi.fn(),
  hostedAccounts: vi.fn(),
  followSource: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/api/feeds', () => ({
  feedsApi: {
    addSource: state.addSource,
    importFollows: state.importFollows,
    getSources: state.getSources,
    blueskyAccounts: state.blueskyAccounts,
    hostedAccounts: state.hostedAccounts,
    getPublish: vi.fn().mockResolvedValue({ accounts: [], publish: [], copies: {} }),
    updateSource: vi.fn(),
    followSource: state.followSource,
  },
}))

// The panel reads its route's navigation, which needs no router here.
vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => vi.fn(),
  }),
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

describe('Source type', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
  })

  function label(type: string, account?: string, url = '') {
    const source = {
      id: 's1',
      feed: 'f1',
      type,
      url,
      name: 'Picks',
      account,
    } as Source
    const { container, unmount } = render(
      <I18nProvider i18n={i18n}>
        <SourceType source={source} />
      </I18nProvider>
    )
    const text = container.textContent
    unmount()
    return text
  }

  it('names a Bluesky person as one, followed through an account or not', () => {
    expect(label('person/posts', 'b1', 'did:plc:bob')).toBe('Posts on Bluesky')
  })

  it('names a Bluesky custom feed or list as one', () => {
    expect(label('generator/posts')).toBe('Bluesky feed or list')
    expect(label('list/posts')).toBe('Bluesky feed or list')
  })

  it('names the other kinds of source', () => {
    expect(label('rss')).toBe('RSS')
    expect(label('feed/memories')).toBe('Memories')
    expect(label('account/timeline')).toBe('Account timeline')
    expect(label('account/posts')).toBe('Account posts')
    expect(
      label('person/posts', 'a1', 'https://there.example/users/bob')
    ).toBe('Posts on ActivityPub')
    expect(label('person/posts', undefined, 'did:plc:bob')).toBe(
      'Posts on Bluesky'
    )
    expect(label('tag/posts')).toBe('Hashtag')
    expect(label('feed/posts')).toBe('Mochi feed')
  })
})

describe('Import follows from a file', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
    state.getSources.mockReset().mockResolvedValue({ data: { sources: [] } })
    state.importFollows.mockReset()
    state.success.mockReset()
    state.error.mockReset()
  })

  it('shows the import running, then how many follows it added', async () => {
    let finish: (value: unknown) => void = () => {}
    state.importFollows.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { container } = render(
      <QueryClientProvider client={client}>
        <I18nProvider i18n={i18n}>
          <SourcesPanel feedId='f1' />
        </I18nProvider>
      </QueryClientProvider>
    )
    const add = await screen.findByRole('button', { name: 'Add source' })
    expect((add as HTMLButtonElement).disabled).toBe(false)
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    const file = new File(['Account address\nbob@there.example\n'], 'following_accounts.csv', { type: 'text/csv' })
    // jsdom's File has no text().
    Object.defineProperty(file, 'text', {
      value: () => Promise.resolve('Account address\nbob@there.example\n'),
    })
    fireEvent.change(input, { target: { files: [file] } })
    // While the request runs, the button that holds Import is busy.
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(true))
    expect(add.querySelector('.animate-spin')).toBeTruthy()
    finish({ imported: 2, more: false, total: 3 })
    await waitFor(() => expect(state.success).toHaveBeenCalledWith('2 follows imported'))
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false))
    expect(add.querySelector('.animate-spin')).toBeNull()
  })
})

describe('A followed source whose follow is gone', () => {
  const person = (id: string, name: string, state: Source['state']) =>
    ({
      id,
      feed: 'f1',
      type: 'person/posts',
      url: 'https://there.example/users/' + id,
      name,
      account: 'a1',
      state,
      credibility: 100,
      interval: 0,
      fetched: 0,
      transform: '',
    }) as unknown as Source

  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
    state.getSources.mockReset().mockResolvedValue({
      data: {
        sources: [
          person('s1', 'Gone', 'unfollowed'),
          person('s2', 'Kept', 'following'),
        ],
      },
    })
    state.followSource.mockReset()
    state.error.mockReset()
  })

  const show = () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <I18nProvider i18n={i18n}>
          <SourcesPanel feedId='f1' />
        </I18nProvider>
      </QueryClientProvider>
    )
  }

  it('reads as not following, not refused, and offers to follow again', async () => {
    show()
    expect(await screen.findByText('Not following')).toBeTruthy()
    expect(screen.queryByText('Follow refused')).toBeNull()
    const again = screen.getAllByRole('button', { name: 'Follow again' })
    expect(again).toHaveLength(1)
    state.followSource.mockResolvedValue({ data: { state: 'pending' } })
    fireEvent.click(again[0])
    await waitFor(() =>
      expect(state.followSource).toHaveBeenCalledWith('f1', 's1')
    )
    await waitFor(() => expect(state.getSources).toHaveBeenCalledTimes(2))
  })

  it('says so when the follow cannot be sent', async () => {
    show()
    state.followSource.mockRejectedValue(new Error('unreachable'))
    fireEvent.click(await screen.findByRole('button', { name: 'Follow again' }))
    await waitFor(() => expect(state.error).toHaveBeenCalled())
  })
})
