// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/api/feeds', () => ({
  feedsApi: { view: vi.fn(), setDefaultSort: vi.fn(), setFeedSort: vi.fn() },
}))

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
