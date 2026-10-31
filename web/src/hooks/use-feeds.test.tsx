// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ReactNode } from 'react'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { feedsApi } from '@/api/feeds'
import { useFeeds, type FeedsAnswer } from './use-feeds'

vi.mock('@/api/feeds', () => ({ feedsApi: { view: vi.fn() } }))

function answer(...ids: string[]): FeedsAnswer {
  return {
    data: {
      feeds: ids.map((id) => ({ id, name: id, fingerprint: id })),
      user_id: 'me',
      hasAi: true,
    } as unknown as FeedsAnswer['data'],
  }
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider i18n={i18n}>{children}</I18nProvider>
)

beforeEach(() => {
  vi.mocked(feedsApi.view).mockReset()
  vi.mocked(feedsApi.view).mockResolvedValue(answer('fetched'))
})

describe('useFeeds', () => {
  it("uses the loader's answer for the first load, and asks for every later one", async () => {
    const initial = answer('handed')
    const { result } = renderHook(() => useFeeds({ initial }), { wrapper })

    await act(() => result.current.refreshFeedsFromApi())

    expect(feedsApi.view).not.toHaveBeenCalled()
    expect(result.current.feeds.map((feed) => feed.id)).toEqual(['handed'])
    expect(result.current.userId).toBe('me')
    expect(result.current.hasAi).toBe(true)

    await act(() => result.current.refreshFeedsFromApi())

    expect(feedsApi.view).toHaveBeenCalledTimes(1)
    expect(result.current.feeds.map((feed) => feed.id)).toEqual(['fetched'])
  })

  it('asks on a later mount handed the same answer: a return shows what has changed', async () => {
    const initial = answer('handed')
    const first = renderHook(() => useFeeds({ initial }), { wrapper })
    await act(() => first.result.current.refreshFeedsFromApi())
    first.unmount()

    // The router shows its cached loader data on a return.
    const again = renderHook(() => useFeeds({ initial }), { wrapper })
    await act(() => again.result.current.refreshFeedsFromApi())

    expect(feedsApi.view).toHaveBeenCalledTimes(1)
  })

  it('asks rather than use an answer handed to a page already mounted', async () => {
    const { result, rerender } = renderHook(
      ({ initial }: { initial: FeedsAnswer }) => useFeeds({ initial }),
      { wrapper, initialProps: { initial: answer('handed') } }
    )
    await act(() => result.current.refreshFeedsFromApi())

    // The loader runs again under the page; its answer may be the older.
    rerender({ initial: answer('late') })
    await act(() => result.current.refreshFeedsFromApi())

    expect(feedsApi.view).toHaveBeenCalledTimes(1)
    expect(result.current.feeds.map((feed) => feed.id)).toEqual(['fetched'])
  })

  it('asks when a sort is given, which the answer was not fetched with', async () => {
    const { result } = renderHook(
      () => useFeeds({ initial: answer('handed'), sort: 'new' }),
      { wrapper }
    )

    await act(() => result.current.refreshFeedsFromApi())

    expect(feedsApi.view).toHaveBeenCalledWith({ sort: 'new' })
  })
})
