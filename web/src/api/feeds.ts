import endpoints from '@/api/endpoints'
import { feedsRequest } from '@/api/request'
import type {
  CreateCommentRequest,
  CreateCommentResponse,
  CreateFeedRequest,
  CreateFeedResponse,
  CreatePostRequest,
  CreatePostResponse,
  DeleteCommentResponse,
  DeleteFeedResponse,
  DeletePostResponse,
  EditCommentResponse,
  EditPostRequest,
  EditPostResponse,
  FindFeedsResponse,
  GetNewCommentResponse,
  GetNewPostParams,
  GetNewPostResponse,
  ProbeFeedParams,
  ProbeFeedResponse,
  ReactToCommentResponse,
  ReactToPostResponse,
  SearchFeedsParams,
  SearchFeedsResponse,
  SubscribeFeedResponse,
  UnsubscribeFeedResponse,
  ViewFeedParams,
  ViewFeedResponse,
} from '@/types'

type DataEnvelope<T> = { data: T }
type MaybeWrapped<T> = T | DataEnvelope<T>

const devConsole = globalThis.console

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object'

const hasDataProperty = <T>(value: unknown): value is DataEnvelope<T> =>
  isRecord(value) && 'data' in value

const logUnexpectedStructure = (context: string, payload: unknown) => {
  if (import.meta.env.DEV) {
    devConsole?.warn?.(`[API] ${context} response shape unexpected`, payload)
  }
}

const toDataResponse = <T>(
  payload: MaybeWrapped<T>,
  context: string
): DataEnvelope<T> => {
  if (hasDataProperty<T>(payload)) {
    return { data: payload.data }
  }

  logUnexpectedStructure(context, payload)
  return { data: payload as T }
}

const omitUndefined = (
  params?: Record<string, string | undefined>
): Record<string, string> | undefined => {
  if (!params) {
    return undefined
  }

  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined
  ) as Array<[string, string]>

  if (entries.length === 0) {
    return undefined
  }

  return Object.fromEntries(entries)
}

const viewFeed = async (params?: ViewFeedParams): Promise<ViewFeedResponse> => {
  // Get posts for a specific feed or all posts
  const endpoint = params?.feed
    ? endpoints.feeds.posts(params.feed)
    : endpoints.feeds.info

  const response = await feedsRequest.get<
    ViewFeedResponse | ViewFeedResponse['data']
  >(endpoint, {
    params: params?.post ? { post: params.post } : undefined,
  })

  return toDataResponse<ViewFeedResponse['data']>(response, 'view feeds')
}

interface GetFeedParams {
  limit?: number
  before?: number
  server?: string  // For remote feeds not stored locally
  _t?: number  // Cache buster
}

const getFeed = async (
  feedId: string,
  params?: GetFeedParams
): Promise<ViewFeedResponse> => {
  const response = await feedsRequest.get<
    ViewFeedResponse | ViewFeedResponse['data']
  >(endpoints.feeds.posts(feedId), {
    params,
  })

  return toDataResponse<ViewFeedResponse['data']>(response, 'view feed')
}

const getFeedInfo = async (feedId: string): Promise<ViewFeedResponse> => {
  const response = await feedsRequest.get<
    ViewFeedResponse | ViewFeedResponse['data']
  >(endpoints.feeds.entityInfo(feedId))

  return toDataResponse<ViewFeedResponse['data']>(response, 'get feed info')
}

const getPost = async (
  feedId: string,
  postId: string
): Promise<ViewFeedResponse> => {
  const response = await feedsRequest.get<
    ViewFeedResponse | ViewFeedResponse['data']
  >(endpoints.feeds.post.get(feedId, postId))

  return toDataResponse<ViewFeedResponse['data']>(response, 'view post')
}

const createFeed = async (
  payload: CreateFeedRequest
): Promise<CreateFeedResponse> => {
  const response = await feedsRequest.post<
    CreateFeedResponse | CreateFeedResponse['data'],
    CreateFeedRequest
  >(endpoints.feeds.create, payload)

  return toDataResponse<CreateFeedResponse['data']>(response, 'create feed')
}

const getFindFeeds = async (): Promise<FindFeedsResponse> => {
  const response = await feedsRequest.get<
    FindFeedsResponse | FindFeedsResponse['data']
  >(endpoints.feeds.info)

  return toDataResponse<FindFeedsResponse['data']>(response, 'find feeds')
}

const searchFeeds = async (
  params: SearchFeedsParams
): Promise<SearchFeedsResponse> => {
  const response = await feedsRequest.get<
    SearchFeedsResponse | SearchFeedsResponse['data']
  >(endpoints.feeds.search, {
    params: { search: params.search },
  })

  return toDataResponse<SearchFeedsResponse['data']>(response, 'search feeds')
}

const probeFeed = async (
  params: ProbeFeedParams
): Promise<ProbeFeedResponse> => {
  const response = await feedsRequest.get<
    ProbeFeedResponse | ProbeFeedResponse['data']
  >(endpoints.feeds.probe, {
    params: { url: params.url },
  })

  return toDataResponse<ProbeFeedResponse['data']>(response, 'probe feed')
}

const subscribeToFeed = async (
  feedId: string,
  server?: string
): Promise<SubscribeFeedResponse> => {
  const response = await feedsRequest.post<
    SubscribeFeedResponse | SubscribeFeedResponse['data'],
    { feed: string; server?: string }
  >(endpoints.feeds.subscribe(feedId), { feed: feedId, server })

  return toDataResponse<SubscribeFeedResponse['data']>(
    response,
    'subscribe to feed'
  )
}

const unsubscribeFromFeed = async (
  feedId: string
): Promise<UnsubscribeFeedResponse> => {
  const response = await feedsRequest.post<
    UnsubscribeFeedResponse | UnsubscribeFeedResponse['data'],
    { feed: string }
  >(endpoints.feeds.unsubscribe(feedId), { feed: feedId })

  return toDataResponse<UnsubscribeFeedResponse['data']>(
    response,
    'unsubscribe from feed'
  )
}

const deleteFeed = async (feedId: string): Promise<DeleteFeedResponse> => {
  const response = await feedsRequest.post<
    DeleteFeedResponse | DeleteFeedResponse['data'],
    { feed: string }
  >(endpoints.feeds.delete(feedId), { feed: feedId })

  return toDataResponse<DeleteFeedResponse['data']>(response, 'delete feed')
}

const getNewPostForm = async (
  feedId: string,
  params?: GetNewPostParams
): Promise<GetNewPostResponse> => {
  const response = await feedsRequest.get<
    GetNewPostResponse | GetNewPostResponse['data']
  >(endpoints.feeds.post.new(feedId), {
    params: omitUndefined({ current: params?.current }),
  })

  return toDataResponse<GetNewPostResponse['data']>(response, 'new post form')
}

const createPost = async (
  payload: CreatePostRequest
): Promise<CreatePostResponse> => {
  const formData = new FormData()
  formData.append('feed', payload.feed)
  formData.append('body', payload.body)

  // Spec uses 'files' as array field name
  if (payload.files && payload.files.length > 0) {
    for (const file of payload.files) {
      formData.append('files', file)
    }
  }

  const response = await feedsRequest.post<
    CreatePostResponse | CreatePostResponse['data'],
    FormData
  >(endpoints.feeds.post.create(payload.feed), formData, {
    headers: {
      'Content-Type': undefined,
    },
  })

  return toDataResponse<CreatePostResponse['data']>(response, 'create post')
}

const reactToPost = async (
  feedId: string,
  postId: string,
  reaction: string
): Promise<ReactToPostResponse> => {
  const response = await feedsRequest.post<
    ReactToPostResponse | ReactToPostResponse['data'],
    { post: string; reaction: string }
  >(endpoints.feeds.post.react(feedId, postId), {
    post: postId,
    reaction: reaction,
  })

  return toDataResponse<ReactToPostResponse['data']>(response, 'react to post')
}

const editPost = async (
  payload: EditPostRequest
): Promise<EditPostResponse> => {
  const formData = new FormData()
  formData.append('feed', payload.feed)
  formData.append('post', payload.post)
  formData.append('body', payload.body)

  // Attachment IDs to keep, in order (for reordering)
  if (payload.attachments) {
    for (const id of payload.attachments) {
      formData.append('attachments', id)
    }
  }

  // New files to add
  if (payload.files && payload.files.length > 0) {
    for (const file of payload.files) {
      formData.append('files', file)
    }
  }

  const response = await feedsRequest.post<
    EditPostResponse | EditPostResponse['data'],
    FormData
  >(endpoints.feeds.post.edit(payload.feed, payload.post), formData, {
    headers: {
      'Content-Type': undefined,
    },
  })

  return toDataResponse<EditPostResponse['data']>(response, 'edit post')
}

const deletePost = async (
  feedId: string,
  postId: string
): Promise<DeletePostResponse> => {
  const response = await feedsRequest.post<
    DeletePostResponse | DeletePostResponse['data'],
    { feed: string; post: string }
  >(endpoints.feeds.post.delete(feedId, postId), {
    feed: feedId,
    post: postId,
  })

  return toDataResponse<DeletePostResponse['data']>(response, 'delete post')
}

const getNewCommentForm = async (
  feedId: string,
  postId: string,
  parent?: string
): Promise<GetNewCommentResponse> => {
  const response = await feedsRequest.get<
    GetNewCommentResponse | GetNewCommentResponse['data']
  >(endpoints.feeds.comment.new(feedId, postId), {
    params: omitUndefined({ parent }),
  })

  return toDataResponse<GetNewCommentResponse['data']>(
    response,
    'new comment form'
  )
}

const createComment = async (
  payload: CreateCommentRequest
): Promise<CreateCommentResponse> => {
  // Spec requires multipart/form-data
  const formData = new FormData()
  formData.append('feed', payload.feed)
  formData.append('post', payload.post)
  formData.append('body', payload.body)
  if (payload.parent) {
    formData.append('parent', payload.parent)
  }

  const response = await feedsRequest.post<
    CreateCommentResponse | CreateCommentResponse['data'],
    FormData
  >(endpoints.feeds.comment.create(payload.feed, payload.post), formData, {
    headers: {
      'Content-Type': undefined,
    },
  })

  return toDataResponse<CreateCommentResponse['data']>(
    response,
    'create comment'
  )
}

const reactToComment = async (
  feedId: string,
  postId: string,
  commentId: string,
  reaction: string
): Promise<ReactToCommentResponse> => {
  const response = await feedsRequest.post<
    ReactToCommentResponse | ReactToCommentResponse['data'],
    { comment: string; reaction: string }
  >(endpoints.feeds.comment.react(feedId, postId), {
    comment: commentId,
    reaction: reaction,
  })

  return toDataResponse<ReactToCommentResponse['data']>(
    response,
    'react to comment'
  )
}

const editComment = async (
  feedId: string,
  postId: string,
  commentId: string,
  body: string
): Promise<EditCommentResponse> => {
  const response = await feedsRequest.post<
    EditCommentResponse | EditCommentResponse['data'],
    { feed: string; post: string; comment: string; body: string }
  >(endpoints.feeds.comment.edit(feedId, postId, commentId), {
    feed: feedId,
    post: postId,
    comment: commentId,
    body,
  })

  return toDataResponse<EditCommentResponse['data']>(response, 'edit comment')
}

const deleteComment = async (
  feedId: string,
  postId: string,
  commentId: string
): Promise<DeleteCommentResponse> => {
  const response = await feedsRequest.post<
    DeleteCommentResponse | DeleteCommentResponse['data'],
    { feed: string; post: string; comment: string }
  >(endpoints.feeds.comment.delete(feedId, postId, commentId), {
    feed: feedId,
    post: postId,
    comment: commentId,
  })

  return toDataResponse<DeleteCommentResponse['data']>(
    response,
    'delete comment'
  )
}

export const feedsApi = {
  view: viewFeed,
  get: getFeed,
  getInfo: getFeedInfo,
  getPost,
  create: createFeed,
  delete: deleteFeed,
  find: getFindFeeds,
  search: searchFeeds,
  probe: probeFeed,
  subscribe: subscribeToFeed,
  unsubscribe: unsubscribeFromFeed,
  getNewPostForm,
  createPost,
  editPost,
  deletePost,
  reactToPost,
  getNewCommentForm,
  createComment,
  editComment,
  deleteComment,
  reactToComment,
}

export default feedsApi
