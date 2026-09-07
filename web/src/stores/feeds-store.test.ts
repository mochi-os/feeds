// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

/* eslint-disable lingui/no-unlocalized-strings -- test assertions and fixtures, not user-facing */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))

vi.mock('@/api/feeds', () => ({
  feedsApi: { view: vi.fn(), setDefaultSort: vi.fn(), setFeedSort: vi.fn() },
}))

// Keep every real @mochi/web export; only spy on toast.error.
vi.mock('@mochi/web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mochi/web')>()
  return { ...actual, toast: { ...actual.toast, error: toastError } }
})

import { feedsApi } from '@/api/feeds'
import { useFeedsStore } from './feeds-store'

describe('feeds store map tiles', () => {
  it('keeps the tile source the server sends with the feed list', async () => {
    const tiles = { url: 'https://tiles.example/{z}/{x}/{y}.png', attribution: '© Tiles' }
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
