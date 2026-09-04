// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { describe, expect, it } from 'vitest'
import { linkifyText, sanitizeHtml } from './utils'

describe('sanitizeHtml', () => {
  it('drops class, so remote HTML cannot reach the app\'s own overlay utilities', () => {
    const html = sanitizeHtml('<a href="https://evil.example" class="fixed inset-0 z-50 opacity-0">x</a>')
    expect(html).toContain('href="https://evil.example"')
    expect(html).not.toContain('class=')
  })

  it('keeps the attributes a link needs', () => {
    const html = sanitizeHtml('<a href="https://example.com" target="_blank" rel="noopener">x</a>')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
  })
})

describe('linkifyText', () => {
  it('emits anchors the wrapper styles, with no class of their own', () => {
    const html = linkifyText('see https://example.com/page now')
    expect(html).toContain('<a href="https://example.com/page"')
    expect(html).not.toContain('class=')
  })
})
