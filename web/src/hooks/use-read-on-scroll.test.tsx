// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

/* eslint-disable lingui/no-unlocalized-strings -- test assertions and fixtures, not user-facing */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useReadOnScroll } from './use-read-on-scroll'

// Capture the IntersectionObserver callback so the test can drive intersections
// directly (the jsdom mock in setup.ts is a no-op).
let ioCallback: IntersectionObserverCallback
class MockIntersectionObserver {
  constructor(cb: IntersectionObserverCallback) {
    ioCallback = cb
  }
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  takeRecords = () => []
  root = null
  rootMargin = ''
  thresholds: number[] = []
}

function makeEl(postId: string, read: '0' | '1'): HTMLElement {
  const el = document.createElement('div')
  el.dataset.postId = postId
  el.dataset.feedId = 'feed-1'
  el.dataset.read = read
  return el
}

function intersect(el: HTMLElement) {
  ioCallback(
    [{ target: el, isIntersecting: true } as unknown as IntersectionObserverEntry],
    {} as IntersectionObserver
  )
}

describe('useReadOnScroll read gate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    global.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof globalThis.IntersectionObserver
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('marks an unread post but never an already-read one after the dwell time', () => {
    const markRead = vi.fn()
    renderHook(() => useReadOnScroll(markRead))

    const unread = makeEl('unread-post', '0')
    const alreadyRead = makeEl('read-post', '1')

    intersect(unread)
    intersect(alreadyRead)

    // Dwell past MIN_VISIBLE_MS and let the periodic sweep fire.
    vi.advanceTimersByTime(2500)

    // Pre-fix, the sweep reported every visible post, so scrolling past an
    // already-read post decremented the badge. Now only the unread one fires.
    expect(markRead).toHaveBeenCalledWith('unread-post', 'feed-1')
    expect(markRead).not.toHaveBeenCalledWith('read-post', 'feed-1')
    expect(markRead).toHaveBeenCalledTimes(1)
  })

  it('does not mark a post that leaves the viewport once it is already read', () => {
    const markRead = vi.fn()
    renderHook(() => useReadOnScroll(markRead))

    const el = makeEl('read-post', '1')
    intersect(el)

    // Visible long enough, then scrolls out of view.
    vi.advanceTimersByTime(1200)
    ioCallback(
      [{ target: el, isIntersecting: false } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver
    )

    expect(markRead).not.toHaveBeenCalled()
  })
})
