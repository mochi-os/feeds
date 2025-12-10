import type { Feed } from './feeds'
import type { Reaction, ReactionInput } from './posts'

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
  children: Comment[]
}

export interface GetNewCommentParams {
  feed: string
  post: string
  parent?: string
}

export interface GetNewCommentResponse {
  data: {
    feed: Feed
    post: string
    parent?: string
  }
}

export interface CreateCommentRequest {
  feed: string
  post: string
  body: string
  parent?: string
}

export interface CreateCommentResponse {
  data: {
    id: string
    feed: Feed
    post: string
  }
}

export interface ReactToCommentRequest {
  feed: string
  post: string
  comment: string
  reaction: ReactionInput
}

export interface ReactToCommentResponse {
  data: {
    feed: Feed
    post: string
    comment: string
    reaction: ReactionInput
  }
}
