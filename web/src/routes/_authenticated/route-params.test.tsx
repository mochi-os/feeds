// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
// The router hands a route its parameters percent-decoded, so an address can
// make $feedId or $postId hold `/`, `\`, `?` or `#`, which the page then wrote
// into the paths it requests with the reader's token: a link to the owner's
// own server deleted their feed. Each route answers not-found for a parameter
// that is not a feed address or a post id, before its loader or page runs.
import { QueryClient } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  type AnyRoute,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route as FeedRoute } from './$feedId'
import { Route as PostRoute } from './$feedId_.$postId'
import { Route as SettingsRoute } from './$feedId_.settings'
import { Route as SourcesRoute } from './$feedId_.sources'

const { getInfo, get, pages } = vi.hoisted(() => ({
  getInfo: vi.fn(),
  get: vi.fn(),
  pages: [] as string[],
}))

vi.mock('@/api/feeds', () => ({ feedsApi: { getInfo, get } }))
vi.mock('@/features/feeds/pages', () => ({ EntityFeedPage: () => null }))

const ENTITY = '1sfEACmTnQhBVgquGhaCs8Jw4SXKF9XY2apnUwJ63duq2QSxh5'
const FINGERPRINT = 'va7kZSfKM'
const POST = '0193a1b2c3d4e5f60718293a4b5c6d7e'

// A page that says it rendered: every request these routes make is made by
// their page or their loader, so a page that never renders asked for nothing.
function page(name: string) {
  return function Page() {
    pages.push(name)
    return <p>{name}</p>
  }
}

function options(route: AnyRoute) {
  return route.options as {
    params?: { parse?: (params: Record<string, string>) => unknown }
    loader?: (context: never) => unknown
  }
}

function open(address: string) {
  const root = createRootRoute({
    component: Outlet,
    notFoundComponent: () => <p>not found</p>,
  })
  const child = (path: string, route: AnyRoute, loader = false) =>
    createRoute({
      getParentRoute: () => root,
      path,
      params: options(route).params as never,
      loader: loader ? (options(route).loader as never) : undefined,
      component: page(path),
    })
  const router = createRouter({
    routeTree: root.addChildren([
      child('$feedId', FeedRoute, true),
      child('$feedId/$postId', PostRoute),
      child('$feedId/settings', SettingsRoute),
      child('$feedId/sources', SourcesRoute),
    ]),
    history: createMemoryHistory({ initialEntries: [address] }),
    context: { queryClient: new QueryClient() },
  })
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  pages.length = 0
  getInfo.mockResolvedValue({ data: { feed: { id: ENTITY } } })
  get.mockResolvedValue({ data: { posts: [] } })
})

describe('feed routes', () => {
  it.each([
    ['a backslash climb to delete', `/${ENTITY}%5C-%5Cdelete%3Fx%3D`],
    ['a slash climb to privacy', `/${ENTITY}%2F-%2Fprivacy%3Fprivacy%3Dpublic`],
    ['a short name', '/feed'],
  ])('refuse %s with no request', async (_name, address) => {
    open(address)
    expect(await screen.findByText('not found')).toBeTruthy()
    expect(getInfo).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
    expect(pages).toEqual([])
  })

  it.each([
    ['a post that names an action', `/${FINGERPRINT}/delete`],
    ['a post that climbs', `/${FINGERPRINT}/${POST}%2Fdelete`],
    ['a feed that climbs', `/${ENTITY}%2F-%2Fdelete/${POST}`],
    ['settings of a feed that climbs', `/${ENTITY}%2F-%2Fdelete/settings`],
    ['sources of a feed that climbs', `/${ENTITY}%5C-%5Cdelete/sources`],
  ])('refuse %s before the page renders', async (_name, address) => {
    open(address)
    expect(await screen.findByText('not found')).toBeTruthy()
    expect(pages).toEqual([])
  })

  // CONTROL: the same routes open what they are given.
  it.each([
    ['a feed by entity id', `/${ENTITY}`, '$feedId'],
    ['a feed by fingerprint', `/${FINGERPRINT}`, '$feedId'],
    ['a post', `/${FINGERPRINT}/${POST}`, '$feedId/$postId'],
    ['settings', `/${ENTITY}/settings`, '$feedId/settings'],
    ['sources', `/va7-kZS-fKM/sources`, '$feedId/sources'],
  ])('open %s', async (_name, address, name) => {
    open(address)
    expect(await screen.findByText(name)).toBeTruthy()
    if (name === '$feedId') expect(getInfo).toHaveBeenCalledTimes(1)
  })
})
