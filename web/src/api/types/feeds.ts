import type { Post } from './posts'

export type FeedPrivacy = 'public' | 'private'

export interface Feed {
  id: string
  fingerprint: string
  name: string
  privacy: FeedPrivacy
  owner: number
  subscribers: number
  updated: number
  entity?: Record<string, unknown>
}

export interface DirectoryEntry {
  id: string
  fingerprint: string
  fingerprint_hyphens: string
  name: string
  class: string
  created: number
}

export interface ViewFeedParams {
  feed?: string
  post?: string
}

export interface ViewFeedResponse {
  data: {
    feed?: Feed | Partial<Feed>
    posts?: Post[]
    feeds?: Feed[]
    owner?: boolean
    user?: string
  }
}

export interface CreateFeedRequest {
  name: string
  privacy: FeedPrivacy
}

export interface CreateFeedResponse {
  data: {
    id: string
    fingerprint: string
  }
}

export interface FindFeedsResponse {
  data: Record<string, unknown>
}

export interface SearchFeedsParams {
  search: string
}

export interface SearchFeedsResponse {
  data: DirectoryEntry[]
}

export interface GetNewFeedResponse {
  data: {
    name?: string
  }
}

// Subscribe/Unsubscribe now use feedId in body
export interface SubscribeFeedRequest {
  feed: string
}

// According to YAML, subscribe returns { data: { fingerprint: string } }
export interface SubscribeFeedResponse {
  data: {
    fingerprint: string
  }
}

export interface UnsubscribeFeedRequest {
  feed: string
}

// According to YAML, unsubscribe returns { data: { success: boolean } }
export interface UnsubscribeFeedResponse {
  data: {
    success: boolean
  }
}
