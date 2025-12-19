import { useRef, useState } from 'react'
import {
  Button,
  Card,
  ConfirmDialog,
} from '@mochi/common'
import type { Attachment, FeedPost, ReactionId } from '@/types'
import { ArrowLeft, ArrowRight, MessageSquare, Paperclip, Pencil, Send, Trash2, X } from 'lucide-react'

// Unified attachment type for editing - can be existing or new
type EditingAttachment =
  | { kind: 'existing'; attachment: Attachment }
  | { kind: 'new'; file: File; previewUrl?: string }
import { STRINGS } from '../constants'
import { sanitizeHtml } from '../utils'
import { CommentThread } from './comment-thread'
import { PostAttachments } from './post-attachments'
import { ReactionBar, hasReactions } from './reaction-bar'

type FeedPostsProps = {
  posts: FeedPost[]
  commentDrafts: Record<string, string>
  onDraftChange: (postId: string, value: string) => void
  onAddComment: (feedId: string, postId: string, body?: string) => void
  onReplyToComment: (feedId: string, postId: string, parentCommentId: string, body: string) => void
  onPostReaction: (feedId: string, postId: string, reaction: ReactionId | '') => void
  onCommentReaction: (feedId: string, postId: string, commentId: string, reaction: ReactionId | '') => void
  onEditPost?: (feedId: string, postId: string, body: string, order?: string[], files?: File[]) => void
  onDeletePost?: (feedId: string, postId: string) => void
  onEditComment?: (feedId: string, postId: string, commentId: string, body: string) => void
  onDeleteComment?: (feedId: string, postId: string, commentId: string) => void
  showFeedName?: boolean
  isFeedOwner?: boolean
}

export function FeedPosts({
  posts,
  commentDrafts,
  onDraftChange,
  onAddComment,
  onReplyToComment,
  onPostReaction,
  onCommentReaction,
  onEditPost,
  onDeletePost,
  onEditComment,
  onDeleteComment,
  showFeedName = false,
  isFeedOwner = false,
}: FeedPostsProps) {
  const [replyingTo, setReplyingTo] = useState<{ postId: string; commentId: string } | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [commentingOn, setCommentingOn] = useState<string | null>(null)
  const [editingPost, setEditingPost] = useState<{
    id: string
    feedId: string
    body: string
    items: EditingAttachment[]
  } | null>(null)
  const [deletingPost, setDeletingPost] = useState<{ id: string; feedId: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (posts.length === 0) {
    return (
      <p className='py-8 text-center text-muted-foreground'>
        {STRINGS.NO_POSTS_YET}
      </p>
    )
  }

  return (
    <div className='space-y-4'>
      {posts.map((post) => (
        <Card key={post.id} className='group relative overflow-hidden py-0'>
          <div className='p-4 space-y-3'>
            {/* Feed name and timestamp (hide when editing, show on hover, hide when comment hovered) */}
            {editingPost?.id !== post.id && (
              <div className='absolute top-4 right-4 opacity-0 group-hover:opacity-100 group-has-[.group\/comment:hover]:opacity-0 transition-opacity'>
                <span className='text-xs text-muted-foreground'>
                  {showFeedName && post.feedName && <>{post.feedName} · </>}
                  {post.createdAt}
                </span>
              </div>
            )}

            {/* Post body - show edit form if editing */}
            {editingPost?.id === post.id ? (
              <div className='space-y-3'>
                <textarea
                  value={editingPost.body}
                  onChange={(e) => setEditingPost({ ...editingPost, body: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setEditingPost(null)
                    }
                  }}
                  className='w-full border rounded-md px-3 py-2 text-base resize-none min-h-24'
                  rows={4}
                  autoFocus
                />

                {/* Attachments grid - unified list of existing and new */}
                {editingPost.items.length > 0 && (
                  <div className='space-y-2'>
                    <div className='text-xs font-medium text-muted-foreground'>Attachments</div>
                    <div className='flex flex-wrap gap-2'>
                      {editingPost.items.map((item, index, arr) => {
                        const isExisting = item.kind === 'existing'
                        const isImage = isExisting
                          ? item.attachment.type?.startsWith('image/')
                          : item.file.type?.startsWith('image/')
                        const thumbnailUrl = isExisting && isImage
                          ? `/feeds/${post.feedId}/-/attachments/${item.attachment.id}/thumbnail`
                          : undefined
                        const previewUrl = !isExisting && isImage
                          ? URL.createObjectURL(item.file)
                          : undefined
                        const itemKey = isExisting
                          ? item.attachment.id
                          : `new-${item.file.name}-${item.file.size}-${item.file.lastModified}`
                        const isFirst = index === 0
                        const isLast = index === arr.length - 1

                        return (
                          <div
                            key={itemKey}
                            className={`group/att relative overflow-hidden rounded-[8px] flex items-center justify-center ${
                              isExisting ? 'border bg-muted' : 'border-2 border-dashed border-primary/30 bg-muted/50'
                            }`}
                          >
                            {isImage && (thumbnailUrl || previewUrl) ? (
                              <img
                                src={thumbnailUrl || previewUrl}
                                alt={isExisting ? item.attachment.name : item.file.name}
                                className='max-h-[150px] max-w-[200px]'
                              />
                            ) : (
                              <div className='flex h-[100px] w-[150px] flex-col items-center justify-center gap-1 px-2'>
                                <Paperclip className='size-6 text-muted-foreground' />
                                <span className='text-xs text-muted-foreground text-center line-clamp-2 break-all'>
                                  {isExisting ? item.attachment.name : item.file.name}
                                </span>
                              </div>
                            )}
                            {/* Hover overlay with controls */}
                            <div className='absolute inset-0 bg-black/50 opacity-0 group-hover/att:opacity-100 transition-opacity flex items-center justify-center gap-2'>
                              <button
                                type='button'
                                className='size-9 rounded-full bg-white/20 text-white hover:bg-white/30 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center'
                                disabled={isFirst}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingPost((prev) => {
                                    if (!prev || index === 0) return prev
                                    const newItems = [...prev.items]
                                    ;[newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]]
                                    return { ...prev, items: newItems }
                                  })
                                }}
                              >
                                <ArrowLeft className='size-5' />
                              </button>
                              <button
                                type='button'
                                className='size-9 rounded-full bg-white/20 text-white hover:bg-white/30 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center'
                                disabled={isLast}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingPost((prev) => {
                                    if (!prev || index >= prev.items.length - 1) return prev
                                    const newItems = [...prev.items]
                                    ;[newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]]
                                    return { ...prev, items: newItems }
                                  })
                                }}
                              >
                                <ArrowRight className='size-5' />
                              </button>
                              <button
                                type='button'
                                className='size-9 rounded-full bg-white/20 text-white hover:bg-white/30 flex items-center justify-center'
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingPost((prev) => {
                                    if (!prev) return prev
                                    return {
                                      ...prev,
                                      items: prev.items.filter((_, i) => i !== index)
                                    }
                                  })
                                }}
                              >
                                <X className='size-5' />
                              </button>
                            </div>
                            {/* Position indicator or New badge */}
                            <div className={`absolute top-2 left-2 ${
                              isExisting
                                ? 'size-6 rounded-full bg-black/60 text-white text-xs font-medium flex items-center justify-center'
                                : 'px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-medium'
                            }`}>
                              {isExisting ? index + 1 : 'New'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type='file'
                  multiple
                  className='hidden'
                  onChange={(e) => {
                    if (e.target.files) {
                      const newItems: EditingAttachment[] = Array.from(e.target.files).map(file => ({
                        kind: 'new' as const,
                        file,
                      }))
                      setEditingPost({
                        ...editingPost,
                        items: [...editingPost.items, ...newItems]
                      })
                    }
                    e.target.value = ''
                  }}
                />

                <div className='flex justify-between'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className='size-4 mr-1' />
                    Add files
                  </Button>
                  <div className='flex gap-2'>
                    <Button variant='outline' size='sm' onClick={() => setEditingPost(null)}>
                      Cancel
                    </Button>
                    <Button
                      size='sm'
                      disabled={!editingPost.body.trim()}
                      onClick={() => {
                        // Build order list with existing IDs and "new:N" placeholders
                        const order: string[] = []
                        const newFiles: File[] = []
                        let newIndex = 0
                        for (const item of editingPost.items) {
                          if (item.kind === 'existing') {
                            order.push(item.attachment.id)
                          } else {
                            order.push(`new:${newIndex}`)
                            newFiles.push(item.file)
                            newIndex++
                          }
                        }
                        onEditPost?.(
                          editingPost.feedId,
                          editingPost.id,
                          editingPost.body.trim(),
                          order,
                          newFiles
                        )
                        setEditingPost(null)
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className='text-lg font-medium leading-relaxed whitespace-pre-wrap'
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.body) }}
              />
            )}

            {/* Attachments (hide when editing this post) */}
            {post.attachments && post.attachments.length > 0 && editingPost?.id !== post.id && (
              <PostAttachments attachments={post.attachments} feedId={post.feedId} />
            )}

            {/* Actions row - reactions always visible if present, buttons on hover */}
            {editingPost?.id !== post.id && (
              <div className={`flex items-center gap-1 text-xs text-muted-foreground ${
                hasReactions(post.reactions, post.userReaction) ? '' : 'h-0 overflow-hidden group-hover:h-auto group-hover:overflow-visible'
              }`}>
                {/* Reaction counts - always visible */}
                <ReactionBar
                  counts={post.reactions}
                  activeReaction={post.userReaction}
                  onSelect={(reaction) => onPostReaction(post.feedId, post.id, reaction)}
                  showButton={false}
                />
                {/* Action buttons - visible on hover, hide when comment hovered */}
                <div className='flex items-center gap-3 opacity-0 group-hover:opacity-100 group-has-[.group\/comment:hover]:opacity-0 transition-opacity'>
                  <ReactionBar
                    counts={post.reactions}
                    activeReaction={post.userReaction}
                    onSelect={(reaction) => onPostReaction(post.feedId, post.id, reaction)}
                    showCounts={false}
                  />
                  <button
                    type='button'
                    className='inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors'
                    onClick={() => setCommentingOn(commentingOn === post.id ? null : post.id)}
                  >
                    <MessageSquare className='size-3' />
                    Comment
                  </button>
                  {(isFeedOwner || post.isOwner) && onEditPost && onDeletePost && (
                    <>
                      <button
                        type='button'
                        className='inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors'
                        onClick={() => setEditingPost({
                          id: post.id,
                          feedId: post.feedId,
                          body: post.body,
                          items: (post.attachments ?? []).map(att => ({ kind: 'existing' as const, attachment: att }))
                        })}
                      >
                        <Pencil className='size-3' />
                        Edit
                      </button>
                      <button
                        type='button'
                        className='inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors'
                        onClick={() => setDeletingPost({ id: post.id, feedId: post.feedId })}
                      >
                        <Trash2 className='size-3' />
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Expanded comment input */}
            {commentingOn === post.id && (
              <div className='flex items-end gap-2'>
                <textarea
                  placeholder={STRINGS.COMMENT_PLACEHOLDER}
                  value={commentDrafts[post.id] ?? ''}
                  onChange={(e) => onDraftChange(post.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      const draft = (e.target as HTMLTextAreaElement).value.trim()
                      if (draft) {
                        onAddComment(post.feedId, post.id, draft)
                        setCommentingOn(null)
                      }
                    } else if (e.key === 'Escape') {
                      setCommentingOn(null)
                    }
                  }}
                  className='flex-1 border rounded-md px-3 py-2 text-sm resize-none'
                  rows={2}
                  autoFocus
                />
                <Button
                  type='button'
                  size='icon'
                  variant='ghost'
                  className='size-8'
                  onClick={() => setCommentingOn(null)}
                  aria-label='Cancel comment'
                >
                  <X className='size-4' />
                </Button>
                <Button
                  size='icon'
                  className='size-8'
                  disabled={!commentDrafts[post.id]?.trim()}
                  onClick={() => {
                    const draft = commentDrafts[post.id]?.trim()
                    if (draft) {
                      onAddComment(post.feedId, post.id, draft)
                      setCommentingOn(null)
                    }
                  }}
                  aria-label='Submit comment'
                >
                  <Send className='size-4' />
                </Button>
              </div>
            )}

            {/* Comments */}
            {post.comments.length > 0 && (
              <div className='pt-3 border-t'>
                {post.comments.map((comment) => (
                  <CommentThread
                    key={comment.id}
                    comment={comment}
                    feedId={post.feedId}
                    postId={post.id}
                    replyingTo={replyingTo}
                    replyDraft={replyDraft}
                    onStartReply={(commentId) => {
                      setReplyingTo({ postId: post.id, commentId })
                      setReplyDraft('')
                    }}
                    onCancelReply={() => {
                      setReplyingTo(null)
                      setReplyDraft('')
                    }}
                    onReplyDraftChange={setReplyDraft}
                    onSubmitReply={(commentId) => {
                      if (replyDraft.trim()) {
                        onReplyToComment(post.feedId, post.id, commentId, replyDraft.trim())
                        setReplyingTo(null)
                        setReplyDraft('')
                      }
                    }}
                    onReact={(commentId, reaction) => onCommentReaction(post.feedId, post.id, commentId, reaction)}
                    onEdit={onEditComment ? (commentId, body) => onEditComment(post.feedId, post.id, commentId, body) : undefined}
                    onDelete={onDeleteComment ? (commentId) => onDeleteComment(post.feedId, post.id, commentId) : undefined}
                    isFeedOwner={isFeedOwner || post.isOwner}
                  />
                ))}
              </div>
            )}
          </div>
        </Card>
      ))}

      {/* Delete post confirmation dialog */}
      <ConfirmDialog
        open={!!deletingPost}
        onOpenChange={(open) => !open && setDeletingPost(null)}
        title="Delete post"
        desc="Are you sure you want to delete this post? This will also delete all comments on this post. This action cannot be undone."
        confirmText="Delete"
        handleConfirm={() => {
          if (deletingPost) {
            onDeletePost?.(deletingPost.feedId, deletingPost.id)
            setDeletingPost(null)
          }
        }}
      />
    </div>
  )
}
