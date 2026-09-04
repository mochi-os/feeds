// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

/* eslint-disable lingui/no-unlocalized-strings -- test assertions and fixtures, not user-facing */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getInfo } = vi.hoisted(() => ({ getInfo: vi.fn() }))

vi.mock('@/api/feeds', () => ({ feedsApi: { getInfo } }))
// The route component pulls the whole feed-page graph; the loader under test
// needs none of it.
vi.mock('@/features/feeds/pages', () => ({ EntityFeedPage: () => null }))

import { loadFeed } from './$feedId'

describe('$feedId loader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a not-found flag instead of redirecting when the feed is missing', async () => {
    getInfo.mockResolvedValueOnce({ data: { feed: null } })

    // Pre-fix this threw redirect({ to: '/' }); it must now resolve.
    const result = await loadFeed('deadbeef0')

    expect(result.notFound).toBe(true)
    expect(result.feed).toBeNull()
    expect(result.loaderError).toBeNull()
  })

  it('treats a feed row with no id as not found', async () => {
    getInfo.mockResolvedValueOnce({ data: { feed: { name: 'ghost' } } })

    const result = await loadFeed('deadbeef0')

    expect(result.notFound).toBe(true)
  })

  it('returns the feed when present', async () => {
    getInfo.mockResolvedValueOnce({
      data: { feed: { id: 'f1', name: 'Feed' }, permissions: { view: true } },
    })

    const result = await loadFeed('f1')

    expect(result.notFound).toBe(false)
    expect(result.feed?.id).toBe('f1')
    expect(result.permissions).toEqual({ view: true })
  })

  it('carries the error message (not a not-found) when the info request throws', async () => {
    getInfo.mockRejectedValueOnce(new Error('offline'))

    const result = await loadFeed('f1')

    expect(result.notFound).toBe(false)
    expect(result.feed).toBeNull()
    expect(result.loaderError).toBe('offline')
  })
})
