import { useCallback } from 'react'
import { toast, getErrorMessage, type PostData } from '@mochi/common'
import { feedsApi } from '@/api/feeds'

interface UsePostHandlersProps {
  onRefresh: (feedId: string) => Promise<void>
}

export function usePostHandlers({ onRefresh }: UsePostHandlersProps) {
  const handleEditPost = useCallback(
    async (
      feedId: string,
      postId: string,
      body: string,
      data?: PostData,
      order?: string[],
      files?: File[]
    ) => {
      try {
        await feedsApi.editPost({
          feed: feedId,
          post: postId,
          body,
          data,
          order,
          files,
        })
        await onRefresh(feedId)
        toast.success('Post updated')
      } catch (error) {
        console.error('[usePostHandlers] Failed to edit post', error)
        toast.error(getErrorMessage(error, 'Failed to edit post'))
      }
    },
    [onRefresh]
  )

  const handleDeletePost = useCallback(
    async (feedId: string, postId: string) => {
      try {
        await feedsApi.deletePost(feedId, postId)
        await onRefresh(feedId)
        toast.success('Post deleted')
      } catch (error) {
        console.error('[usePostHandlers] Failed to delete post', error)
        toast.error(getErrorMessage(error, 'Failed to delete post'))
      }
    },
    [onRefresh]
  )

  const handleEditComment = useCallback(
    async (feedId: string, postId: string, commentId: string, body: string) => {
      try {
        await feedsApi.editComment(feedId, postId, commentId, body)
        await onRefresh(feedId)
        toast.success('Comment updated')
      } catch (error) {
        console.error('[usePostHandlers] Failed to edit comment', error)
        toast.error(getErrorMessage(error, 'Failed to edit comment'))
      }
    },
    [onRefresh]
  )

  const handleDeleteComment = useCallback(
    async (feedId: string, postId: string, commentId: string) => {
      try {
        await feedsApi.deleteComment(feedId, postId, commentId)
        await onRefresh(feedId)
        toast.success('Comment deleted')
      } catch (error) {
        console.error('[usePostHandlers] Failed to delete comment', error)
        toast.error(getErrorMessage(error, 'Failed to delete comment'))
      }
    },
    [onRefresh]
  )

  return {
    handleEditPost,
    handleDeletePost,
    handleEditComment,
    handleDeleteComment,
  }
}
