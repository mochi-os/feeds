// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { FeedPost } from '@/types'
import { mapPosts } from '@/api/adapters'
import { feedsApi } from '@/api/feeds'

type Lists = InfiniteData<{ posts: FeedPost[] }>

// One fetch for a burst of frames about a post: tagging sends one per tag.
const PAUSE = 200

const pending = new Map<string, ReturnType<typeof setTimeout>>()

/** A frame from a feed's websocket, as far as the cached lists care. */
interface PostFrame {
  type: string
  feed: string
  post?: string
}

/**
 * Apply a frame about one post to the cached post lists: the post is fetched
 * again and changed where it stands, or taken out when it was deleted.
 * Reloading the list for it instead would reorder the list under the reader,
 * and with the unread filter on take away every post they have read. False
 * when the frame is not about one post, and the lists have to be reloaded.
 */
export function applyFrame(client: QueryClient, frame: PostFrame): boolean {
  if (!frame.post) return false
  switch (frame.type) {
    case 'post/delete':
      dropPost(client, frame.post)
      return true
    case 'post/edit':
    case 'comment/create':
    case 'comment/add':
    case 'comment/edit':
    case 'comment/delete':
    case 'react/post':
    case 'react/comment':
    case 'tag/add':
    case 'tag/remove':
      patchPost(client, frame.feed, frame.post)
      return true
  }
  return false
}

/** Fetch `post` again, after a pause, and fold it into the lists that hold it. */
function patchPost(client: QueryClient, feed: string, post: string) {
  const waiting = pending.get(post)
  if (waiting) clearTimeout(waiting)
  pending.set(
    post,
    setTimeout(() => {
      pending.delete(post)
      void fold(client, feed, post)
    }, PAUSE)
  )
}

/** Take `post` out of every cached list. */
function dropPost(client: QueryClient, post: string) {
  client.setQueriesData<Lists>({ queryKey: ['posts'] }, (lists) => {
    if (!lists?.pages || !holds(lists, post)) return lists
    return {
      ...lists,
      pages: lists.pages.map((page) => ({
        ...page,
        posts: page.posts.filter((item) => item.id !== post),
      })),
    }
  })
}

function holds(lists: Lists | undefined, post: string): boolean {
  return !!lists?.pages?.some((page) =>
    page.posts.some((item) => item.id === post)
  )
}

async function fold(client: QueryClient, feed: string, post: string) {
  const listed = client
    .getQueriesData<Lists>({ queryKey: ['posts'] })
    .some(([, lists]) => holds(lists, post))
  if (!listed) return
  let fresh: FeedPost | undefined
  try {
    const response = await feedsApi.view({ feed, post })
    fresh = mapPosts(response.data?.posts).find((item) => item.id === post)
  } catch {
    // The post keeps what it showed.
    return
  }
  if (!fresh) return
  const found = fresh
  client.setQueriesData<Lists>({ queryKey: ['posts'] }, (lists) => {
    if (!lists?.pages || !holds(lists, post)) return lists
    return {
      ...lists,
      pages: lists.pages.map((page) => ({
        ...page,
        posts: page.posts.map((item) =>
          item.id === post ? merge(item, found) : item
        ),
      })),
    }
  })
}

/**
 * What a frame can have changed in `fresh`, over the list's own copy of the
 * post. The rest stays the list's: a post fetched by itself has no relevance
 * score, which the list is ordered by, nor the permissions the aggregate
 * stamps on each post, and a read mark made here may not have reached the
 * server yet.
 */
function merge(listed: FeedPost, fresh: FeedPost): FeedPost {
  return {
    ...listed,
    body: fresh.body,
    bodyHtml: fresh.bodyHtml,
    data: fresh.data,
    tags: fresh.tags,
    attachments: fresh.attachments,
    reactions: fresh.reactions,
    userReaction: fresh.userReaction,
    comments: fresh.comments,
    up: fresh.up,
    down: fresh.down,
    source: fresh.source,
    following: fresh.following,
    read: fresh.read || listed.read,
  }
}
