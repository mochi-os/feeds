import { useRef, useState } from 'react'
import type { FeedComment, ReactionId } from '@/types'
import {
  Button,
  CommentTreeLayout,
  ConfirmDialog,
  MentionTextarea,
  renderMentions,
  useImageObjectUrls,
  type MentionUser,
} from '@mochi/web'
import { Paperclip, Pencil, Plus, Reply, Send, Trash2, X } from 'lucide-react'
import { CommentAttachments } from './comment-attachments'
import { ReactionBar } from './reaction-bar'

type CommentThreadProps = {
  comment: FeedComment
  feedId: string
  postId: string
  replyingTo: { postId: string; commentId: string } | null
  replyDraft: string
  onStartReply: (commentId: string) => void
  onCancelReply: () => void
  onReplyDraftChange: (value: string) => void
  onSubmitReply: (commentId: string, files?: File[]) => void
  onReact: (commentId: string, reaction: ReactionId | '') => void
  onEdit?: (commentId: string, body: string) => void
  onDelete?: (commentId: string) => void
  currentUserId?: string
  depth?: number
  canReact?: boolean
  canComment?: boolean
  canManageComments?: boolean
  onSearchPeople?: (query: string) => Promise<MentionUser[]>
}

export function CommentThread({
  comment,
  feedId,
  postId,
  replyingTo,
  replyDraft,
  onStartReply,
  onCancelReply,
  onReplyDraftChange,
  onSubmitReply,
  onReact,
  onEdit,
  onDelete,
  currentUserId,
  depth = 0,
  canReact = true,
  canComment = true,
  canManageComments = false,
  onSearchPeople,
}: CommentThreadProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [replyFiles, setReplyFiles] = useState<File[]>([])
  const replyPreviewUrls = useImageObjectUrls(replyFiles)
  const replyFileRef = useRef<HTMLInputElement>(null)

  const isReplying =
    replyingTo?.postId === postId && replyingTo?.commentId === comment.id
  const hasReplies = Boolean(comment.replies && comment.replies.length > 0)
  const isCommentOwner = Boolean(
    currentUserId && currentUserId === comment.subscriberId
  )

  const canEditComment = isCommentOwner && onEdit
  const canDeleteComment = (isCommentOwner || canManageComments) && onDelete

  const getTotalReplyCount = (c: FeedComment): number => {
    if (!c.replies) return 0
    return (
      c.replies.length +
      c.replies.reduce((acc, reply) => acc + getTotalReplyCount(reply), 0)
    )
  }
  const totalDescendants = getTotalReplyCount(comment)

  const avatar = (
    <div className='bg-primary text-primary-foreground z-10 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold'>
      {comment.author.charAt(0).toUpperCase()}
    </div>
  )

  const collapsedContent = (
    <div className='flex h-5 items-center gap-2 py-0.5 text-xs select-none'>
      <span className='text-muted-foreground font-medium'>
        {comment.author}
      </span>
      <span className='text-muted-foreground'>·</span>
      <span className='text-muted-foreground'>{comment.createdAt}</span>
      <button
        type='button'
        onClick={() => setCollapsed(false)}
        className='text-primary ml-2 flex cursor-pointer items-center gap-1 hover:underline'
      >
        {totalDescendants > 0 ? (
          <>
            {totalDescendants === 1 ? (
              <span>1 reply</span>
            ) : (
              <span className='flex items-center gap-1'>
                <Plus className='size-4' />
                {totalDescendants} more replies
              </span>
            )}
          </>
        ) : (
          <span className='text-muted-foreground italic'>(expanded)</span>
        )}
      </button>
    </div>
  )

  const content = (
    <div className='space-y-1.5'>
      {/* Per-row hover group - only this comment's row, not children */}
      <div className='group/row'>
        <div className='flex h-5 items-center gap-2 text-xs'>
          <span className='text-foreground font-medium'>{comment.author}</span>
          <span className='text-muted-foreground'>·</span>
          <span className='text-muted-foreground'>{comment.createdAt}</span>
        </div>

        {editing === comment.id ? (
          <div className='space-y-2'>
            <MentionTextarea
              value={editBody}
              onValueChange={setEditBody}
              onSearchPeople={onSearchPeople}
              rows={3}
              autoFocus
            />
            <div className='flex justify-end gap-2'>
              <Button
                variant='outline'
                size='sm'
                className='h-7 text-xs'
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button
                size='sm'
                className='h-7 text-xs'
                disabled={!editBody.trim()}
                onClick={() => {
                  if (canEditComment) {
                    onEdit?.(comment.id, editBody.trim())
                    setEditing(null)
                  }
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <p className='text-foreground text-sm leading-relaxed whitespace-pre-wrap'>
            {renderMentions(comment.body)}
          </p>
        )}

        <CommentAttachments attachments={comment.attachments} />

        <div className='flex min-h-7 items-center gap-2 pt-0.5'>
          {/* Reaction counts - always visible if user has reacted */}
          <ReactionBar
            counts={comment.reactions}
            activeReaction={comment.userReaction}
            onSelect={(reaction) => onReact(comment.id, reaction)}
            showButton={false}
            showCounts={true}
          />

          {/* Action buttons - always visible on mobile, hover-reveal on desktop */}
          <div className='flex items-center gap-1 transition-opacity pointer-events-auto opacity-100 md:pointer-events-none md:opacity-0 md:group-hover/row:pointer-events-auto md:group-hover/row:opacity-100'>
            {canReact && (
              <ReactionBar
                counts={comment.reactions}
                activeReaction={comment.userReaction}
                onSelect={(reaction) => onReact(comment.id, reaction)}
                showButton={true}
                showCounts={false}
              />
            )}

            {canComment && (
              <button
                type='button'
                className='text-muted-foreground hover:text-foreground transition-colors'
                onClick={() => onStartReply(comment.id)}
              >
                <Reply className='size-4' />
              </button>
            )}

            {canEditComment && (
              <button
                type='button'
                className='text-muted-foreground hover:text-foreground transition-colors'
                onClick={() => {
                  setEditing(comment.id)
                  setEditBody(comment.body)
                }}
              >
                <Pencil className='size-4' />
              </button>
            )}
            {canDeleteComment && (
              <button
                type='button'
                className='text-muted-foreground hover:text-foreground transition-colors'
                onClick={() => setDeleting(true)}
              >
                <Trash2 className='size-4' />
              </button>
            )}
          </div>
        </div>
      </div>

      {isReplying && (
        <div className='mt-2 space-y-2 border-t pt-2'>
          <MentionTextarea
            placeholder={`Reply to ${comment.author}...`}
            value={replyDraft}
            onValueChange={onReplyDraftChange}
            onSearchPeople={onSearchPeople}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                if (replyDraft.trim()) onSubmitReply(comment.id, replyFiles.length > 0 ? replyFiles : undefined)
              } else if (e.key === 'Escape') onCancelReply()
            }}
            className='min-h-0'
            rows={2}
            autoFocus
          />
          {replyFiles.length > 0 && (
            <div className='flex flex-wrap gap-2'>
              {replyFiles.map((file, i) => (
                <div key={i} className='bg-muted relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs'>
                  {file.type.startsWith('image/') && (
                    <img src={replyPreviewUrls[i] ?? undefined} alt={file.name} className='h-8 w-8 rounded object-cover' />
                  )}
                  <Paperclip className='text-muted-foreground size-3 shrink-0' />
                  <span className='max-w-40 truncate'>{file.name}</span>
                  <button type='button' onClick={() => setReplyFiles((prev) => prev.filter((_, idx) => idx !== i))} className='text-muted-foreground hover:text-foreground ml-0.5'>
                    <X className='size-3.5' />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className='flex items-center justify-end gap-2'>
            <input
              ref={replyFileRef}
              type='file'
              multiple
              onChange={(e) => { if (e.target.files) { const f = Array.from(e.target.files); setReplyFiles((prev) => [...prev, ...f]) } e.target.value = '' }}
              className='hidden'
            />
            <Button type='button' variant='ghost' size='icon' className='size-8' onClick={() => replyFileRef.current?.click()} aria-label='Attach reply files'>
              <Paperclip className='size-4' />
            </Button>
            <Button
              type='button'
              size='icon'
              variant='ghost'
              className='size-8'
              onClick={onCancelReply}
              aria-label='Cancel reply'
            >
              <X className='size-4' />
            </Button>
            <Button
              type='button'
              size='icon'
              className='size-8'
              disabled={!replyDraft.trim()}
              onClick={() => onSubmitReply(comment.id, replyFiles.length > 0 ? replyFiles : undefined)}
              aria-label='Send reply'
            >
              <Send className='size-4' />
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title='Delete comment'
        desc='Are you sure you want to delete this comment? This will also delete all replies. This action cannot be undone.'
        confirmText='Delete'
        destructive={true}
        handleConfirm={() => {
          onDelete?.(comment.id)
          setDeleting(false)
        }}
      />
    </div>
  )

  const children = hasReplies ? (
    <>
      {comment.replies!.map((reply) => (
        <CommentThread
          key={reply.id}
          comment={reply}
          feedId={feedId}
          postId={postId}
          replyingTo={replyingTo}
          replyDraft={replyDraft}
          onStartReply={onStartReply}
          onCancelReply={onCancelReply}
          onReplyDraftChange={onReplyDraftChange}
          onSubmitReply={onSubmitReply}
          onReact={onReact}
          onEdit={onEdit}
          onDelete={onDelete}
          currentUserId={currentUserId}
          depth={depth + 1}
          canReact={canReact}
          canComment={canComment}
          canManageComments={canManageComments}
          onSearchPeople={onSearchPeople}
        />
      ))}
    </>
  ) : null

  return (
    <CommentTreeLayout
      depth={depth}
      isCollapsed={collapsed}
      onToggleCollapse={() => setCollapsed(!collapsed)}
      hasChildren={hasReplies}
      avatar={avatar}
      content={content}
      collapsedContent={collapsedContent}
    >
      {children}
    </CommentTreeLayout>
  )
}
