import { useState, useMemo, useCallback } from 'react'
import type { FeedComment, ReactionId } from '@/types'
import { Button, ConfirmDialog } from '@mochi/common'
import { Minus, Pencil, Plus, Reply, Send, Trash2, X } from 'lucide-react'
import { ReactionBar } from './reaction-bar'

// ============================================================================
// Types
// ============================================================================

type CommentTreeProps = {
  comments: FeedComment[]
  feedId: string
  postId: string
  replyingTo: { postId: string; commentId: string } | null
  replyDraft: string
  onStartReply: (commentId: string) => void
  onCancelReply: () => void
  onReplyDraftChange: (value: string) => void
  onSubmitReply: (commentId: string) => void
  onReact: (commentId: string, reaction: ReactionId | '') => void
  onEdit?: (commentId: string, body: string) => void
  onDelete?: (commentId: string) => void
  isFeedOwner?: boolean
  canReact?: boolean
  canComment?: boolean
}

// Flattened comment with tree metadata
interface FlatComment {
  comment: FeedComment
  depth: number
  // For each ancestor depth level (0 to depth-1), whether there are more siblings after this comment
  // This tells us which vertical lines to draw
  ancestorHasMoreSiblings: boolean[]
  isLastSibling: boolean
  hasChildren: boolean
  parentId: string | null
}

// ============================================================================
// Tree Flattening Logic
// ============================================================================

/**
 * Flatten the comment tree into a list with depth and sibling information.
 * This allows us to render depth columns correctly.
 */
function flattenCommentTree(
  comments: FeedComment[],
  depth: number = 0,
  ancestorHasMoreSiblings: boolean[] = [],
  parentId: string | null = null
): FlatComment[] {
  const result: FlatComment[] = []

  comments.forEach((comment, index) => {
    const isLastSibling = index === comments.length - 1
    const hasChildren = (comment.replies?.length ?? 0) > 0

    result.push({
      comment,
      depth,
      ancestorHasMoreSiblings: [...ancestorHasMoreSiblings],
      isLastSibling,
      hasChildren,
      parentId,
    })

    // Recursively process children
    if (hasChildren) {
      const childAncestorInfo = [
        ...ancestorHasMoreSiblings,
        !isLastSibling, // If current is not last, its vertical line continues
      ]
      result.push(
        ...flattenCommentTree(
          comment.replies!,
          depth + 1,
          childAncestorInfo,
          comment.id
        )
      )
    }
  })

  return result
}

// Layout constants - tune these for pixel-perfect Reddit-like appearance
const DEPTH_COLUMN_WIDTH = 22 // Width of each depth column
const LINE_CENTER = 10 // Position of the vertical line center from left edge

// ============================================================================
// Collapse Toggle Button Component (Reddit-style circle)
// ============================================================================

function CollapseButton({
  isCollapsed,
  onClick,
  className,
  style,
}: {
  isCollapsed: boolean
  onClick: (e: React.MouseEvent) => void
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        z-10 flex size-[18px] items-center justify-center rounded-full
        border-2 border-border bg-background
        text-muted-foreground
        hover:border-primary hover:text-primary hover:bg-primary/5
        transition-all duration-150 cursor-pointer
        ${className ?? ''}
      `}
      style={style}
      aria-label={isCollapsed ? 'Expand thread' : 'Collapse thread'}
    >
      {isCollapsed ? (
        <Plus className="size-3" strokeWidth={2.5} />
      ) : (
        <Minus className="size-3" strokeWidth={2.5} />
      )}
    </button>
  )
}

// ============================================================================
// Single Comment Row Component
// ============================================================================

type CommentRowProps = {
  flatComment: FlatComment
  feedId: string
  postId: string
  replyingTo: { postId: string; commentId: string } | null
  replyDraft: string
  onStartReply: (commentId: string) => void
  onCancelReply: () => void
  onReplyDraftChange: (value: string) => void
  onSubmitReply: (commentId: string) => void
  onReact: (commentId: string, reaction: ReactionId | '') => void
  onEdit?: (commentId: string, body: string) => void
  onDelete?: (commentId: string) => void
  isFeedOwner?: boolean
  canReact?: boolean
  canComment?: boolean
  isCollapsed: boolean
  onToggleCollapse: () => void
  collapsedCount: number
}

function CommentRow({
  flatComment,
  feedId: _feedId,
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
  isFeedOwner = false,
  canReact = true,
  canComment = true,
  isCollapsed,
  onToggleCollapse,
  collapsedCount,
}: CommentRowProps) {
  const { comment, depth, ancestorHasMoreSiblings, isLastSibling, hasChildren: _hasChildren } = flatComment

  const [editing, setEditing] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [deleting, setDeleting] = useState(false)

  const isReplying =
    replyingTo?.postId === postId && replyingTo?.commentId === comment.id

  const canEditComment = isFeedOwner && onEdit
  const canDeleteComment = isFeedOwner && onDelete

  const handleCollapseClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleCollapse()
  }, [onToggleCollapse])

  // Build depth columns for ancestor continuation lines
  const renderDepthColumns = useMemo(() => {
    const columns: React.ReactNode[] = []

    // Render continuation columns for all ancestor levels
    for (let d = 0; d < depth; d++) {
      const showLine = ancestorHasMoreSiblings[d]
      
      columns.push(
        <div
          key={`depth-${d}`}
          className="relative shrink-0 group/line"
          style={{ width: DEPTH_COLUMN_WIDTH }}
        >
          {showLine && (
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-border/60 group-hover/line:bg-primary/40 transition-colors cursor-pointer"
              style={{ left: LINE_CENTER }}
              onClick={handleCollapseClick}
              title="Click to collapse"
            />
          )}
        </div>
      )
    }

    return columns
  }, [depth, ancestorHasMoreSiblings, handleCollapseClick])

  // Root-level (depth 0) column with collapse button
  const renderRootColumn = (
    <div 
      className="relative shrink-0"
      style={{ width: DEPTH_COLUMN_WIDTH }}
    >
      {/* Vertical line continuing to next sibling (if not last) */}
      {!isLastSibling && (
        <div
          className="absolute top-[22px] bottom-0 w-[2px] bg-border/60 hover:bg-primary/40 transition-colors cursor-pointer"
          style={{ left: LINE_CENTER }}
          onClick={handleCollapseClick}
        />
      )}
      
      {/* Collapse toggle button */}
      <CollapseButton
        isCollapsed={isCollapsed}
        onClick={handleCollapseClick}
        className="absolute"
        style={{ left: LINE_CENTER - 9, top: 2 }}
      />
    </div>
  )

  // Nested-level column with connector and collapse button
  const renderNestedColumn = (
    <div
      className="relative shrink-0"
      style={{ width: DEPTH_COLUMN_WIDTH }}
    >
      {/* Vertical line from top (comes from parent) */}
      <div
        className="absolute top-0 w-[2px] bg-border/60"
        style={{ left: LINE_CENTER, height: 12 }}
      />
      
      {/* Horizontal connector branch to content */}
      <div
        className="absolute h-[2px] bg-border/60"
        style={{ 
          left: LINE_CENTER,
          top: 12,
          width: DEPTH_COLUMN_WIDTH - LINE_CENTER
        }}
      />
      
      {/* Continuing vertical line for siblings below (if not last) */}
      {!isLastSibling && (
        <div
          className="absolute bottom-0 w-[2px] bg-border/60 hover:bg-primary/40 transition-colors cursor-pointer"
          style={{ left: LINE_CENTER, top: 12 }}
          onClick={handleCollapseClick}
        />
      )}
      
      {/* Collapse toggle button at the corner */}
      <CollapseButton
        isCollapsed={isCollapsed}
        onClick={handleCollapseClick}
        className="absolute"
        style={{ left: LINE_CENTER - 9, top: 3 }}
      />
    </div>
  )

  return (
    <div className="flex group/comment">
      {/* Depth continuation columns */}
      {renderDepthColumns}
      
      {/* Current level column with connector */}
      {depth === 0 ? renderRootColumn : renderNestedColumn}

      {/* Comment content */}
      <div className="flex-1 min-w-0 pb-2 pt-0.5">
        {isCollapsed ? (
          // Collapsed state - single line summary
          <div className="flex items-center gap-2 py-1 text-xs select-none">
            <span className="font-medium text-muted-foreground">
              {comment.author}
            </span>
            <span className="text-muted-foreground/60">·</span>
            <span className="text-muted-foreground/80 text-[11px]">{comment.createdAt}</span>
            {collapsedCount > 0 && (
              <button
                onClick={onToggleCollapse}
                className="ml-1 inline-flex items-center gap-1 text-primary/80 hover:text-primary hover:underline"
              >
                <Plus className="size-3" />
                <span>{collapsedCount} more {collapsedCount === 1 ? 'reply' : 'replies'}</span>
              </button>
            )}
          </div>
        ) : (
          // Expanded state - full comment
          <div className="space-y-1">
            {/* Header with author and timestamp */}
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-foreground">
                {comment.author}
              </span>
              <span className="text-muted-foreground/60">·</span>
              <span className="text-muted-foreground/80 text-[11px]">{comment.createdAt}</span>
            </div>

            {/* Comment body or edit form */}
            {editing === comment.id ? (
              <div className="space-y-2 pt-1">
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="min-h-16 w-full resize-none rounded-md border px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20"
                  rows={3}
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!editBody.trim()}
                    onClick={() => {
                      onEdit?.(comment.id, editBody.trim())
                      setEditing(null)
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {comment.body}
              </p>
            )}

            {/* Actions bar */}
            <div className="flex min-h-[22px] items-center gap-3 pt-0.5">
              <ReactionBar
                counts={comment.reactions}
                activeReaction={comment.userReaction}
                onSelect={(reaction) => onReact(comment.id, reaction)}
                showButton={canReact}
                showCounts={true}
              />

              {canComment && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
                  onClick={() => onStartReply(comment.id)}
                >
                  <Reply className="size-3" />
                  <span>Reply</span>
                </button>
              )}

              {(canEditComment || canDeleteComment) && (
                <div className="ml-auto flex items-center gap-2 opacity-0 group-hover/comment:opacity-100 transition-opacity">
                  {canEditComment && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
                      onClick={() => {
                        setEditing(comment.id)
                        setEditBody(comment.body)
                      }}
                    >
                      <Pencil className="size-3" />
                      Edit
                    </button>
                  )}
                  {canDeleteComment && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive inline-flex items-center gap-1 text-xs transition-colors"
                      onClick={() => setDeleting(true)}
                    >
                      <Trash2 className="size-3" />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Reply input */}
            {isReplying && (
              <div className="mt-2 flex items-end gap-2 border-t pt-2">
                <textarea
                  placeholder={`Reply to ${comment.author}...`}
                  value={replyDraft}
                  onChange={(e) => onReplyDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      if (replyDraft.trim()) {
                        onSubmitReply(comment.id)
                      }
                    } else if (e.key === 'Escape') {
                      onCancelReply()
                    }
                  }}
                  className="flex-1 resize-none rounded-md border px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20"
                  rows={2}
                  autoFocus
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={onCancelReply}
                  aria-label="Cancel reply"
                >
                  <X className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  className="size-8"
                  disabled={!replyDraft.trim()}
                  onClick={() => onSubmitReply(comment.id)}
                  aria-label="Submit reply"
                >
                  <Send className="size-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Delete confirmation dialog */}
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title="Delete comment"
          desc="Are you sure you want to delete this comment? This will also delete all replies. This action cannot be undone."
          confirmText="Delete"
          handleConfirm={() => {
            onDelete?.(comment.id)
            setDeleting(false)
          }}
        />
      </div>
    </div>
  )
}

// ============================================================================
// Main Comment Tree Component
// ============================================================================

export function CommentTree({
  comments,
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
  isFeedOwner = false,
  canReact = true,
  canComment = true,
}: CommentTreeProps) {
  // Track collapsed comments by their IDs
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())

  // Flatten the comment tree with metadata
  const flatComments = useMemo(
    () => flattenCommentTree(comments),
    [comments]
  )

  // Create a map of comment ID to its total descendant count
  const descendantCounts = useMemo(() => {
    const counts: Record<string, number> = {}

    const countDescendants = (comment: FeedComment): number => {
      if (!comment.replies || comment.replies.length === 0) return 0
      let total = comment.replies.length
      for (const reply of comment.replies) {
        total += countDescendants(reply)
      }
      return total
    }

    const processComments = (commentList: FeedComment[]) => {
      for (const comment of commentList) {
        counts[comment.id] = countDescendants(comment)
        if (comment.replies) {
          processComments(comment.replies)
        }
      }
    }

    processComments(comments)
    return counts
  }, [comments])

  // Filter comments - hide descendants of collapsed comments
  const visibleComments = useMemo(() => {
    const hiddenIds = new Set<string>()

    const markDescendantsHidden = (comment: FeedComment) => {
      if (comment.replies) {
        for (const reply of comment.replies) {
          hiddenIds.add(reply.id)
          markDescendantsHidden(reply)
        }
      }
    }

    const markHidden = (commentList: FeedComment[]) => {
      for (const comment of commentList) {
        if (collapsedIds.has(comment.id)) {
          markDescendantsHidden(comment)
        }
        if (comment.replies) {
          markHidden(comment.replies)
        }
      }
    }

    markHidden(comments)
    return flatComments.filter((fc) => !hiddenIds.has(fc.comment.id))
  }, [flatComments, collapsedIds, comments])

  const toggleCollapse = useCallback((commentId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(commentId)) {
        next.delete(commentId)
      } else {
        next.add(commentId)
      }
      return next
    })
  }, [])

  if (comments.length === 0) {
    return null
  }

  return (
    <div className="pt-3 border-t">
      {visibleComments.map((fc) => (
        <CommentRow
          key={fc.comment.id}
          flatComment={fc}
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
          isFeedOwner={isFeedOwner}
          canReact={canReact}
          canComment={canComment}
          isCollapsed={collapsedIds.has(fc.comment.id)}
          onToggleCollapse={() => toggleCollapse(fc.comment.id)}
          collapsedCount={descendantCounts[fc.comment.id] ?? 0}
        />
      ))}
    </div>
  )
}
