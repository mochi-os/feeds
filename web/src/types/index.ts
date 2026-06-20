// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

export type {
  AccessDenyResponse,
  AccessGrantResponse,
  AccessListResponse,
  AccessRevokeResponse,
  AccessRule,
  CreateFeedRequest,
  CreateFeedResponse,
  DeleteFeedResponse,
  DirectoryEntry,
  Feed,
  FeedInfoClassResponse,
  FeedInfoEntityResponse,
  FeedInfoResponse,
  FeedPermissions,
  FeedPrivacy,
  FeedSummary,
  FindFeedsResponse,
  ProbeEntry,
  ProbeFeedParams,
  ProbeFeedResponse,
  SearchFeedsParams,
  SearchFeedsResponse,
  Source,
  SubscribeFeedResponse,
  UnsubscribeFeedResponse,
  ViewFeedParams,
  ViewFeedResponse,
} from './feeds'

// Re-export Feed as FeedInfo for backward compatibility
export { type Feed as FeedInfo } from './feeds'

export type {
  Attachment,
  CreatePostRequest,
  CreatePostResponse,
  DeletePostResponse,
  EditPostRequest,
  EditPostResponse,
  FeedPost,
  GetNewPostParams,
  GetNewPostResponse,
  PostData,
  Reaction,
  ReactionCounts,
  ReactionId,
  ReactionInput,
  ReactionType,
  ReactToPostRequest,
  ReactToPostResponse,
  Post,
  PostSource,
  SavedItem,
  SavedPostSnapshot,
  Tag,
} from './posts'

export type {
  Comment,
  CreateCommentRequest,
  CreateCommentResponse,
  DeleteCommentResponse,
  EditCommentRequest,
  EditCommentResponse,
  FeedComment,
  GetNewCommentParams,
  GetNewCommentResponse,
  ReactToCommentRequest,
  ReactToCommentResponse,
} from './comments'
