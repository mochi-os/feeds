// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { feedsApi } from '@/api/feeds'
import { useFeedsStore } from './feeds-store'

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))

vi.mock('@/api/feeds', () => ({
  feedsApi: { view: vi.fn(), setDefaultSort: vi.fn(), setFeedSort: vi.fn() },
}))

// Keep every real @mochi/web export; only spy on toast.error.
vi.mock('@mochi/web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mochi/web')>()
  return { ...actual, toast: { ...actual.toast, error: toastError } }
})

describe('feeds store map tiles', () => {
  it('keeps the tile source the server sends with the feed list', async () => {
    const tiles = {
      url: 'https://tiles.example/{z}/{x}/{y}.png',
      attribution: '© Tiles',
    }
    vi.mocked(feedsApi.view).mockResolvedValue({ data: { feeds: [], tiles } })
    await useFeedsStore.getState().refresh()
    expect(useFeedsStore.getState().tiles).toEqual(tiles)
  })

  it('holds no tile source until the server answers with one', async () => {
    vi.mocked(feedsApi.view).mockResolvedValue({ data: { feeds: [] } })
    await useFeedsStore.getState().refresh()
    expect(useFeedsStore.getState().tiles).toBeNull()
  })
})

describe('feeds-store sort persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useFeedsStore.setState({ defaultSort: '', feeds: [] })
  })

  it('toasts and keeps the optimistic value when the default-sort write fails', async () => {
    vi.mocked(feedsApi.setDefaultSort).mockRejectedValueOnce(new Error('boom'))

    await useFeedsStore.getState().setDefaultSort('new')

    // Optimistic value survives (no silent revert mid-session)...
    expect(useFeedsStore.getState().defaultSort).toBe('new')
    // ...but the failure is surfaced. Pre-fix the catch block was comment-only.
    expect(toastError).toHaveBeenCalledTimes(1)
  })

  it('does not toast when the default-sort write succeeds', async () => {
    vi.mocked(feedsApi.setDefaultSort).mockResolvedValueOnce(undefined)

    await useFeedsStore.getState().setDefaultSort('hot')

    expect(useFeedsStore.getState().defaultSort).toBe('hot')
    expect(toastError).not.toHaveBeenCalled()
  })

  it('toasts when the per-feed sort write fails', async () => {
    vi.mocked(feedsApi.setFeedSort).mockRejectedValueOnce(new Error('nope'))

    await useFeedsStore.getState().setFeedSort('feed-1', 'top')

    expect(toastError).toHaveBeenCalledTimes(1)
  })
})

describe('feeds store loading', () => {
  /** A request for the feed list that answers when told to. */
  function pending() {
    let answer: (value: unknown) => void = () => {}
    const promise = new Promise((resolve) => {
      answer = resolve
    })
    return { promise, answer }
  }

  const roster = (...names: string[]) => ({
    data: {
      feeds: names.map((name) => ({ id: name, name, fingerprint: name })),
    },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    useFeedsStore.setState({ feeds: [], defaultSort: '', loaded: false })
  })

  it('shares a request in flight between plain loads', async () => {
    const request = pending()
    vi.mocked(feedsApi.view).mockReturnValueOnce(request.promise as never)

    const first = useFeedsStore.getState().load()
    const second = useFeedsStore.getState().load()
    request.answer(roster('a'))
    await Promise.all([first, second])

    expect(feedsApi.view).toHaveBeenCalledTimes(1)
    expect(useFeedsStore.getState().feeds.map((feed) => feed.id)).toEqual(['a'])
    expect(useFeedsStore.getState().loaded).toBe(true)
  })

  it('asks again for a refresh made during a load, once that load has answered', async () => {
    const before = pending()
    const after = pending()
    vi.mocked(feedsApi.view)
      .mockReturnValueOnce(before.promise as never)
      .mockReturnValueOnce(after.promise as never)

    const load = useFeedsStore.getState().load()
    // Something changed while the load was on its way, which it may predate.
    const refresh = useFeedsStore.getState().refresh()
    expect(feedsApi.view).toHaveBeenCalledTimes(1)

    before.answer(roster('a'))
    await load
    await vi.waitFor(() => expect(feedsApi.view).toHaveBeenCalledTimes(2))
    after.answer(roster('a', 'b'))
    await refresh

    expect(useFeedsStore.getState().feeds.map((feed) => feed.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('keeps a roster already loaded rather than a seed, which may be older', async () => {
    vi.mocked(feedsApi.view).mockResolvedValueOnce(roster('a', 'b') as never)
    await useFeedsStore.getState().load()

    // A loader's answer, sent before the reader read posts in feed a.
    useFeedsStore.getState().seed(roster('a').data as never)

    expect(useFeedsStore.getState().feeds.map((feed) => feed.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('leaves a seed to the load already on its way', async () => {
    const request = pending()
    vi.mocked(feedsApi.view).mockReturnValueOnce(request.promise as never)
    const load = useFeedsStore.getState().load()

    useFeedsStore.getState().seed(roster('seeded').data as never)
    expect(useFeedsStore.getState().feeds).toEqual([])
    request.answer(roster('loaded'))
    await load

    expect(useFeedsStore.getState().feeds.map((feed) => feed.id)).toEqual([
      'loaded',
    ])
  })

  it('holds a roster a loader seeds it with, without asking for it', () => {
    useFeedsStore.getState().seed({
      feeds: [{ id: 'a', name: 'A', fingerprint: 'a' }],
      settings: { sort: 'hot' },
    } as never)

    const state = useFeedsStore.getState()
    expect(state.loaded).toBe(true)
    expect(state.defaultSort).toBe('hot')
    expect(state.feeds.map((feed) => feed.id)).toEqual(['a'])
    expect(feedsApi.view).not.toHaveBeenCalled()
  })
})
