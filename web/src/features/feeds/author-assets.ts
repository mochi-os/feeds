// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { FeedComment } from '@/types'
import { addressByAuthor, getAppPath } from '@mochi/web'
import endpoints from '@/api/endpoints'

interface PostRow {
  id: string
  feedId: string
  comments?: FeedComment[]
}

// Where a commenter's person assets (avatar, style) are served: under one of
// their comments, whose route resolves the commenter. Append the slot.
export const commentAssets = (
  feedId: string,
  postId: string,
  commentId: string
) =>
  `${getAppPath()}/${endpoints.feeds.comment.assets(feedId, postId, commentId)}`

// One asset address per commenter across every post's comments, so the
// browser and the style query fetch each commenter's avatar once rather than
// once per comment. The route answers for any comment in a feed the viewer
// can see, so every listed comment may stand in for its author.
export function authorAssets(posts: readonly PostRow[]): Map<string, string> {
  const found = new Map<string, string>()
  for (const post of posts) {
    addressByAuthor(
      post.comments ?? [],
      {
        getAuthor: (comment) => comment.subscriberId,
        getAddress: (comment) =>
          commentAssets(post.feedId, post.id, comment.id),
        getChildren: (comment) => comment.replies,
      },
      found
    )
  }
  return found
}
