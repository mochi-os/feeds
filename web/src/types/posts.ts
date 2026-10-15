// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { PostData } from '@mochi/web'
import type { Comment } from './comments'
import type { Feed, FeedPermissions } from './feeds'

// Attachment type
export interface Attachment {
  id: string
  name: string
  size: number
  type: string
  created: number
  caption?: string
  url?: string
  thumbnail_url?: string
  preview_url?: string
}

// Reaction types
type ReactionType =
  | 'like'
  | 'dislike'
  | 'laugh'
  | 'amazed'
  | 'love'
  | 'sad'
  | 'angry'
  | 'agree'
  | 'disagree'

export type ReactionId = ReactionType
export type ReactionInput = '' | ReactionType
export type ReactionCounts = Record<ReactionId, number>

export interface Reaction {
  feed: string
  post: string
  comment?: string
  subscriber: string
  name: string
  reaction: ReactionType
}

// Tag on a post
interface Tag {
  id: string
  label: string
  qid?: string
  source?: string
  relevance?: number
  interest?: number
}

// Source attribution for posts from external/internal sources
interface PostSource {
  name: string
  url: string
  type: string
}

// A copy of the post on another network, published through one of the owner's
// accounts: where it is and under which address.
export interface PostCopy {
  address: string
  network: string
  remote: string
  url: string
}

// Post from backend
export interface Post {
  id: string
  feed: string
  feed_fingerprint: string
  feed_name: string
  body: string
  body_markdown: string
  data: PostData
  created: number
  created_string: string
  updated: number
  attachments: Attachment[]
  my_reaction: string
  reactions: Reaction[]
  comments: Comment[]
  tags?: Tag[]
  up: number
  down: number
  read: number
  source?: PostSource
  copies?: PostCopy[]
  // How many times the post was boosted on other networks
  boosts?: number
  score?: number
  // Per-post access, stamped by the aggregate ("All feeds") endpoint so each
  // post carries its own feed's react/comment/manage grant.
  permissions?: FeedPermissions
  // Whether the signed-in reader follows the post; only the single-post view
  // says.
  following?: boolean
  // The post's features (phase 17): who may see it, its content warning and
  // sensitive flag, when it was pinned (0 for not), its language, and for a
  // post from another network its author's id and its id there.
  visibility?: PostVisibility
  warning?: string
  sensitive?: number
  pinned?: number
  language?: string
  author?: string
  remote?: string
  // The options the reader voted for in the post's poll.
  voted?: number[]
}

export type PostVisibility = 'public' | 'unlisted' | 'followers'

// Client-side post for display
export interface FeedPost {
  id: string
  feedId: string
  feedName?: string
  author: string
  role: string
  avatar?: string
  created: number
  body: string
  bodyHtml?: string
  data?: PostData
  tags?: Tag[]
  attachments?: Attachment[]
  reactions: ReactionCounts
  userReaction?: ReactionId | null
  comments: import('./comments').FeedComment[]
  feedFingerprint?: string
  isOwner?: boolean
  permissions?: FeedPermissions
  up?: number
  down?: number
  read?: number
  source?: PostSource
  copies?: PostCopy[]
  // How many times the post was boosted on other networks
  boosts?: number
  score?: number
  following?: boolean
  visibility?: PostVisibility
  warning?: string
  sensitive?: boolean
  pinned?: number
  language?: string
  // For a post from another network: its author's id and its id there.
  authorId?: string
  remote?: string
  voted?: number[]
}

// The poll a post is made with: its options, whether several may be chosen,
// and how long it runs in seconds.
export interface PostPollInput {
  options: string[]
  multiple?: boolean
  duration?: number
}

// The features a post is made or edited with.
export interface PostFeatures {
  visibility?: PostVisibility
  warning?: string
  sensitive?: boolean
  language?: string
}

// Slim point-in-time snapshot stored for the "Saved" (read-later) feature.
// Intentionally excludes comments/thread data — just enough to render a
// read-only card and link back to the live post.
export interface SavedPostSnapshot {
  id: string
  feedId: string
  feedFingerprint?: string
  feedName?: string
  author: string
  created: number
  body: string
  bodyHtml?: string
  data?: PostData
  tags?: Tag[]
  attachments?: Attachment[]
  reactions?: ReactionCounts
}

// One entry from the saved/list response: the stored snapshot plus the
// server-side saved-at time (unix seconds).
export interface SavedItem {
  post: SavedPostSnapshot
  created: number
}

// Create post
export interface CreatePostRequest {
  feed: string
  body: string
  data?: PostData
  files?: File[]
  captions?: string[] // aligned with files' order
  // The accounts this post publishes to, overriding the feed's list; absent
  // leaves it to the feed.
  accounts?: string[]
  features?: PostFeatures
  poll?: PostPollInput
}

export interface CreatePostResponse {
  data: {
    feed: Feed
    id: string
    post?: string
    attachments: Attachment[]
  }
}

// React to post
export interface ReactToPostResponse {
  data: {
    feed: Feed
    id: string
    reaction: ReactionInput
  }
}

// Edit post
export interface EditPostRequest {
  feed: string
  post: string
  body: string
  data?: PostData // location data (checkin, travelling)
  order?: string[] // order list with existing IDs and "new:N" placeholders for new files
  files?: File[] // new files to add
  captions?: Record<string, string> // keyed by attachment id or "new:N" placeholder
  features?: PostFeatures
}

export interface EditPostResponse {
  data: {
    feed: Feed
    id: string
    edited: number
  }
}

// Delete post
export interface DeletePostResponse {
  data: {
    feed: Feed
    id: string
  }
}
