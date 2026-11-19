// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { guardParams, paramShapes } from '@mochi/web'

export const APP_ROUTES = {
  HOME: '/',
  FEEDS: {
    VIEW: (feedId: string) => `/${feedId}` as const,
  },
} as const

// A feed is named in an address by its fingerprint or its entity id, and a
// post by its id. The router hands a route its parameters percent-decoded, so
// anything else could carry a `/`, `\`, `?` or `#` into the paths the page
// requests; such an address renders not-found and its page asks for nothing.
const feed = [paramShapes.fingerprint, paramShapes.entity]

/** The `params.parse` of a route under `$feedId`. */
export const parseFeedParams = guardParams({ feedId: feed })

/** The `params.parse` of the `$feedId/$postId` route. */
export const parsePostParams = guardParams({
  feedId: feed,
  postId: paramShapes.id,
})
