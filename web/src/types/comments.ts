// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { Feed } from './feeds'
import type {
  Attachment,
  Reaction,
  ReactionCounts,
  ReactionId,
  ReactionInput,
} from './posts'

// Comment from backend
export interface Comment {
  id: string
  feed: string
  feed_fingerprint: string
  post: string
  parent: string
  subscriber: string
  name: string
  body: string
  body_markdown: string
  created: number
  created_string: string
  user: string
  my_reaction: string
  reactions: Reaction[]
  // A comment from another network: its form (html, cleaned on arrival), the
  // author's page there and the comment's id there.
  format?: string
  page?: string
  remote?: string
  // Anchor: the id of one of the post's attachments this comment is about,
  // its display name (caption or file name) and its caption alone (empty
  // when it has none). Empty when unanchored.
  attachment?: string
  attachment_name?: string
  attachment_caption?: string
  attachments?: Attachment[]
  children: Comment[]
}

// Client-side comment for display
export interface FeedComment {
  id: string
  subscriberId: string
  author: string
  avatar?: string
  created: number
  body: string
  // 'html' for a comment from another network, shown as cleaned HTML; the
  // author's page there, where the name leads.
  format?: string
  page?: string
  reactions: ReactionCounts
  userReaction?: ReactionId | null
  attachments?: Attachment[]
  replies?: FeedComment[]
  // Anchor to one of the post's attachments; see Comment.
  attachment?: string
  attachmentName?: string
  attachmentCaption?: string
}

// Create comment
export interface CreateCommentRequest {
  feed: string
  post: string
  body: string
  parent?: string
  id?: string
  files?: File[]
  // Anchor the comment to one of the post's attachments
  attachment?: string
  // The commenter's own hosted account the comment also goes out from, as a
  // reply to the post's copy on that network
  account?: string
}

export interface CreateCommentResponse {
  data: {
    id: string
    feed: Feed
    post: string
  }
}

// React to comment
export interface ReactToCommentResponse {
  data: {
    feed: Feed
    post: string
    comment: string
    reaction: ReactionInput
  }
}

// Edit comment
export interface EditCommentResponse {
  data: {
    feed: Feed
    post: string
    comment: string
    edited: number
  }
}

// Delete comment
export interface DeleteCommentResponse {
  data: {
    feed: Feed
    post: string
    comment: string
  }
}
