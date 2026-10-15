// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { FeedPost } from '@/types'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createReactionCounts } from '@/features/feeds/constants'
import { PostHeadline } from './post-headline'
import { replaceEmoji } from '../utils'

const base: FeedPost = {
  id: 'p1',
  feedId: 'f1',
  author: 'Feed',
  role: 'Feed',
  created: 1,
  body: 'Hello',
  reactions: createReactionCounts(),
  comments: [],
}

function show(post: FeedPost) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <PostHeadline post={post} />
      </I18nProvider>
    </QueryClientProvider>
  )
}

describe('PostHeadline', () => {
  beforeEach(() => {
    i18n.load('en', {})
    i18n.activate('en')
  })

  it('names the person from another network, who boosted it, and its state', () => {
    show({
      ...base,
      pinned: 5,
      visibility: 'followers',
      data: {
        person: {
          id: 'https://remote.example/u/bob',
          name: 'Bob',
          address: '@bob@remote.example',
          page: 'https://remote.example/@bob',
        },
        boost: { name: 'Carol', page: 'https://remote.example/@carol' },
      },
    })
    const name = screen.getByRole('link', { name: 'Bob' })
    expect(name.getAttribute('href')).toBe('https://remote.example/@bob')
    expect(screen.getByText('@bob@remote.example')).toBeTruthy()
    expect(screen.getByText('Boosted by Carol')).toBeTruthy()
    expect(screen.getByText('Pinned')).toBeTruthy()
    expect(screen.getByText('Followers only')).toBeTruthy()
  })

  it('shows nothing for a plain public post of the feed', () => {
    const { container } = show(base)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('replaceEmoji', () => {
  it('shows a custom emoji the post names and leaves the rest', () => {
    const html = replaceEmoji('<p>Hi :mochi: and :nope:</p>', [
      { name: 'mochi', url: 'https://remote.example/mochi.png' },
      { name: 'bad', url: 'javascript:alert(1)' },
    ])
    expect(html).toContain('<img src="https://remote.example/mochi.png"')
    expect(html).toContain(':nope:')
    expect(replaceEmoji('<p>:bad:</p>', [{ name: 'bad', url: 'javascript:x' }])).toBe('<p>:bad:</p>')
  })
})
