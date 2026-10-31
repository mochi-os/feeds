// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { readFilter, useReadFilter } from './use-read-filter'

// Shell storage as a page sees it before storage answers: the default given.
vi.mock('@mochi/web', async () => {
  const { useState } = await import('react')
  return {
    useShellStorage: <T,>(_key: string, initial: T) => useState<T>(initial),
  }
})

describe('read filter', () => {
  it('starts a feed page opened later with the filter last shown', () => {
    const first = renderHook(() => useReadFilter())
    expect(first.result.current[0]).toBe('all')

    act(() => first.result.current[1]('unread'))
    first.unmount()

    expect(readFilter()).toBe('unread')
    const second = renderHook(() => useReadFilter())
    expect(second.result.current[0]).toBe('unread')
  })
})
