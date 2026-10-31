// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ComponentType } from 'react'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Route } from './$feedId'

const state = vi.hoisted(() => ({
  loaderData: undefined as unknown,
  mounts: 0,
}))

vi.mock('@/api/feeds', () => ({ feedsApi: {} }))

// The page itself is the feed page's own concern; here it only has to say
// when it mounts.
vi.mock('@/features/feeds/pages', async () => {
  const { useEffect } = await import('react')
  return {
    EntityFeedPage: ({ feed }: { feed: { id: string } }) => {
      useEffect(() => {
        state.mounts += 1
      }, [])
      return <div>{feed.id}</div>
    },
  }
})

vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => state.loaderData,
  }),
  useRouter: () => ({ invalidate: vi.fn() }),
  useNavigate: () => vi.fn(),
}))

describe('feed page', () => {
  const Page = (Route as unknown as { component: ComponentType }).component
  const show = () => (
    <I18nProvider i18n={i18n}>
      <Page />
    </I18nProvider>
  )

  it('opens a fresh page for each feed, and keeps it while the feed stays', () => {
    i18n.loadAndActivate({ locale: 'en', messages: {} })
    state.loaderData = { feed: { id: 'a' }, notFound: false }
    const { rerender } = render(show())
    expect(state.mounts).toBe(1)

    // The loader refreshing the same feed keeps the page.
    state.loaderData = { feed: { id: 'a', sort: 'hot' }, notFound: false }
    rerender(show())
    expect(state.mounts).toBe(1)

    state.loaderData = { feed: { id: 'b' }, notFound: false }
    rerender(show())
    expect(state.mounts).toBe(2)
  })
})
