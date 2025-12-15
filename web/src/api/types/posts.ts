import type { Comment } from './comments'
import type { Feed } from './feeds'

export type ReactionType =
  | 'like'
  | 'dislike'
  | 'laugh'
  | 'amazed'
  | 'love'
  | 'sad'
  | 'angry'
  | 'agree'
  | 'disagree'

export type ReactionInput = '' | ReactionType

export interface Reaction {
  feed: string
  post: string
  comment?: string
  subscriber: string
  name: string
  reaction: ReactionType
}

export interface Post {
  id: string
  feed: string
  feed_fingerprint: string
  feed_name: string
  body: string
  body_markdown: string
  created: number
  created_string: string
  updated: number
  attachments: Record<string, unknown>[]
  my_reaction: string
  reactions: Reaction[]
  comments: Comment[]
}

export interface GetNewPostParams {
  current?: string
}

export interface GetNewPostResponse {
  data: {
    feeds: Feed[]
    current?: string
  }
}

export interface CreatePostRequest {
  feed: string
  body: string
  files?: File[]
}

export interface CreatePostResponse {
  data: {
    feed: Feed
    id: string
    attachments: Record<string, unknown>[]
  }
}

export interface ReactToPostRequest {
  post: string
  reaction: ReactionInput
}

export interface ReactToPostResponse {
  data: {
    feed: Feed
    id: string
    reaction: ReactionInput
  }
}
