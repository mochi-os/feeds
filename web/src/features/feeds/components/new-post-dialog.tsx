// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useEffect, useState, useRef, useCallback } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  Label,
  MapView,
  MentionTextarea,
  PlacePicker,
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TravellingPicker,
  type PlaceData,
  type PostData,
  naturalCompare,
  useImageObjectUrls,
  Attachment,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentDescription,
  AttachmentActions,
  AttachmentAction,
  useFormat,
} from '@mochi/web'
import { feedsApi } from '@/api/feeds'
import type { FeedSummary } from '@/types'
import {
  X,
  Paperclip,
  MapPin,
  Plane,
  FilePlus2,
  Loader2,
  Send,
} from 'lucide-react'

type NewPostDialogProps = {
  feeds: FeedSummary[]
  onSubmit: (input: { feedId: string; body: string; data?: PostData; files: File[] }) => void | Promise<void>
  /** Controlled open state */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Hide the trigger button (use when controlled externally) */
  hideTrigger?: boolean
  /** Always show the feed selector, even with a single feed */
  showFeedSelector?: boolean
}

type NewPostFormState = {
  feedId: string
  body: string
  data: PostData
  files: File[]
}

type PlacePickerMode = 'checkin' | null

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export function NewPostDialog({ feeds, onSubmit, open, onOpenChange, hideTrigger, showFeedSelector }: NewPostDialogProps) {
  const { t } = useLingui()
  const { formatFileSize } = useFormat()
  const [internalOpen, setInternalOpen] = useState(false)
  const [placePickerMode, setPlacePickerMode] = useState<PlacePickerMode>(null)
  const [travellingPickerOpen, setTravellingPickerOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)

  // Use controlled state if provided, otherwise use internal state
  const isOpen = open !== undefined ? open : internalOpen
  const setIsOpen = onOpenChange ?? setInternalOpen

  const [form, setForm] = useState<NewPostFormState>(() => ({
    feedId: feeds[0]?.id ?? '',
    body: '',
    data: {},
    files: [],
  }))
  const attachmentPreviewUrls = useImageObjectUrls(form.files)
  const canReorder = form.files.length > 1

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    if (!canReorder) return
    e.dataTransfer.setData('text/plain', index.toString())
    e.dataTransfer.effectAllowed = 'move'
    setDraggingIndex(index)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    if (!canReorder || draggingIndex === null || draggingIndex === index) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTargetIndex(index)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetIndex: number) => {
    if (!canReorder) return
    e.preventDefault()
    const sourceIndex = parseInt(e.dataTransfer.getData('text/plain') || draggingIndex?.toString() || '-1')
    if (sourceIndex === -1 || sourceIndex === targetIndex) {
      setDraggingIndex(null)
      setDropTargetIndex(null)
      return
    }
    const result = [...form.files]
    const [removed] = result.splice(sourceIndex, 1)
    result.splice(targetIndex, 0, removed)
    setForm((prev) => ({ ...prev, files: result }))
    setDraggingIndex(null)
    setDropTargetIndex(null)
  }

  const handleDragEnd = () => {
    setDraggingIndex(null)
    setDropTargetIndex(null)
  }

  useEffect(() => {
    if (feeds.length === 0) {
      setForm((prev) => ({ ...prev, feedId: '' }))
      return
    }

    const hasValidFeed = feeds.some((feed) => feed.id === form.feedId)
    if (!hasValidFeed) {
      setForm((prev) => ({ ...prev, feedId: feeds[0].id }))
    }
  }, [feeds, form.feedId])

  const handlePlaceSelect = (place: PlaceData) => {
    if (placePickerMode === 'checkin') {
      // Checkin and travelling are mutually exclusive
      setForm((prev) => {
        const { travelling, ...rest } = prev.data
        return { ...prev, data: { ...rest, checkin: place } }
      })
      setPlacePickerMode(null)
    }
  }

  const handleTravellingSelect = (origin: PlaceData, destination: PlaceData) => {
    // Checkin and travelling are mutually exclusive
    setForm((prev) => {
      const { checkin, ...rest } = prev.data
      return { ...prev, data: { ...rest, travelling: { origin, destination } } }
    })
  }

  const removeCheckin = () => {
    setForm((prev) => {
      const { checkin, ...rest } = prev.data
      return { ...prev, data: rest }
    })
  }

  const removeTravelling = () => {
    setForm((prev) => {
      const { travelling, ...rest } = prev.data
      return { ...prev, data: rest }
    })
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files) {
      setForm((prev) => ({ ...prev, files: [...prev.files, ...Array.from(files)] }))
    }
    // Reset input to allow selecting the same file again
    event.target.value = ''
  }

  // Check if travelling data is complete (both origin and destination have names)
  const hasTravelling = form.data.travelling?.origin?.name && form.data.travelling?.destination?.name

  // Check if post has content (text, checkin, travelling, or files)
  const hasContent = form.body.trim() || form.data.checkin || hasTravelling || form.files.length > 0

  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.feedId || !hasContent || isSubmitting) return

    // Build clean data object - only include travelling if complete
    const cleanData: PostData = {}
    if (form.data.checkin) {
      cleanData.checkin = form.data.checkin
    }
    if (hasTravelling) {
      cleanData.travelling = form.data.travelling
    }

    const hasData = Object.keys(cleanData).length > 0
    setIsSubmitting(true)
    try {
      await onSubmit({
        feedId: form.feedId,
        body: form.body,
        data: hasData ? cleanData : undefined,
        files: form.files,
      })
      setForm((prev) => ({ ...prev, body: '', data: {}, files: [] }))
      setIsOpen(false)
    } finally {
      setIsSubmitting(false)
    }
  }, [form, hasContent, hasTravelling, isSubmitting, onSubmit, setIsOpen])

  const getPlacePickerTitle = () => {
    return placePickerMode === 'checkin' ? t`Check in` : t`Select location`
  }

  return (
    <>
    <ResponsiveDialog
      open={isOpen}
      onOpenChange={setIsOpen}
      shouldCloseOnInteractOutside={false}
    >
      {!hideTrigger && (
        <ResponsiveDialogTrigger asChild>
          <Button
            variant='outline'
            size='sm'
            className='shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md'
          >
            <FilePlus2 className='size-4' />
            <Trans>New post</Trans>
          </Button>
        </ResponsiveDialogTrigger>
      )}
      <ResponsiveDialogContent className='sm:max-w-[640px] max-h-[90vh] flex flex-col'>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle><Trans>New post</Trans></ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <form className='flex flex-col flex-1 min-h-0' onSubmit={handleSubmit}>
          <div className='space-y-4 overflow-y-auto flex-1 min-h-0 px-1'>
          {(feeds.length > 1 || showFeedSelector) && (
            <div className='space-y-2'>
              <Label htmlFor='legacy-post-feed'><Trans>Feed</Trans></Label>
              <Select
                value={form.feedId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, feedId: value }))}
              >
                <SelectTrigger id='legacy-post-feed' className='w-full justify-between'>
                  <SelectValue placeholder={t`Choose a feed`} />
                </SelectTrigger>
                <SelectContent>
                  {[...feeds].sort((a, b) => naturalCompare(a.name, b.name)).map((feed) => (
                    <SelectItem key={feed.id} value={feed.id}>
                      {feed.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className='space-y-2'>
            <Label htmlFor='legacy-post-body'><Trans>Post content</Trans></Label>
            <MentionTextarea
              id='legacy-post-body'
              className='max-h-[50vh]'
              rows={8}
              placeholder={t`Markdown supported`}
              value={form.body}
              onValueChange={(value) => setForm((prev) => ({ ...prev, body: value }))}
              onSearchPeople={(q) => feedsApi.searchMembers(form.feedId, q)}
            />
          </div>

          {/* Location display */}
          {(form.data.checkin || form.data.travelling) && (
            <div className='space-y-2'>
              {form.data.checkin && (
                <div className='rounded-[8px] border p-3 space-y-2'>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2 text-sm'>
                      <MapPin className='size-4 text-primary' />
                      <span><Trans>at {form.data.checkin.name}</Trans></span>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          className='size-6'
                          onClick={removeCheckin}
                          aria-label={t`Remove check-in`}
                        >
                          <X className='size-4' />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t`Remove check-in`}</TooltipContent>
                    </Tooltip>
                  </div>
                  <MapView
                    lat={form.data.checkin.lat}
                    lon={form.data.checkin.lon}
                    category={form.data.checkin.category}
                  />
                </div>
              )}
              {hasTravelling && form.data.travelling && (
                <div className='rounded-[8px] border p-3 space-y-2'>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2 text-sm'>
                      <Plane className='size-4 text-primary' />
                      <span>
                        {form.data.travelling.origin.name} – {form.data.travelling.destination.name}
                      </span>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          className='size-6'
                          onClick={removeTravelling}
                          aria-label={t`Remove travel route`}
                        >
                          <X className='size-4' />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t`Remove travel route`}</TooltipContent>
                    </Tooltip>
                  </div>
                  <MapView
                    lat={form.data.travelling.destination.lat}
                    lon={form.data.travelling.destination.lon}
                    name={form.data.travelling.destination.name}
                    origin={{
                      lat: form.data.travelling.origin.lat,
                      lon: form.data.travelling.origin.lon,
                      name: form.data.travelling.origin.name,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Location buttons - mutually exclusive, so no disabled state */}
          <div className='flex gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setPlacePickerMode('checkin')}
            >
              <MapPin className='size-4' />
              <Trans>Check-in</Trans>
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setTravellingPickerOpen(true)}
            >
              <Plane className='size-4' />
              <Trans>Travelling</Trans>
            </Button>
          </div>

          {/* Attachments */}
          <div className='space-y-2'>
            {form.files.length > 0 && (
              <>
                <div className='text-xs font-medium text-muted-foreground'><Trans>Attachments</Trans></div>
                <AttachmentGroup
                  onDragOver={(e) => {
                    if (canReorder) e.preventDefault()
                  }}
                >
                  {form.files.map((file, index) => {
                    const isImage = file.type?.startsWith('image/')
                    const previewUrl = isImage
                      ? attachmentPreviewUrls[index] ?? undefined
                      : undefined
                    const tooLarge = file.size > MAX_FILE_SIZE
                    const isDragging = draggingIndex === index
                    const isDropTarget = dropTargetIndex === index

                    return (
                      <Attachment
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                        draggable={canReorder}
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={handleDragEnd}
                        state={tooLarge ? "error" : undefined}
                        className={`
                          ${canReorder ? 'cursor-grab active:cursor-grabbing' : ''}
                          ${isDragging ? 'opacity-40' : ''}
                          ${isDropTarget ? 'ring-primary rounded-lg ring-2 ring-inset' : ''}
                        `}
                      >
                        <AttachmentMedia variant={isImage ? "image" : "icon"}>
                          {isImage && previewUrl ? (
                            <img src={previewUrl} alt={file.name} draggable={false} />
                          ) : (
                            <Paperclip />
                          )}
                        </AttachmentMedia>
                        <AttachmentContent>
                          <AttachmentTitle>{file.name}</AttachmentTitle>
                          <AttachmentDescription>
                            {tooLarge ? (
                              <span className='text-destructive'><Trans>Too large</Trans></span>
                            ) : (
                              formatFileSize(file.size)
                            )}
                          </AttachmentDescription>
                        </AttachmentContent>
                        <AttachmentActions>
                          <AttachmentAction onClick={(e) => {
                            e.stopPropagation()
                            setForm((prev) => ({
                              ...prev,
                              files: prev.files.filter((_, i) => i !== index),
                            }))
                          }} aria-label={t`Remove file`}>
                            <X className='size-4' />
                          </AttachmentAction>
                        </AttachmentActions>
                      </Attachment>
                    )
                  })}
                </AttachmentGroup>
              </>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type='file'
              multiple
              accept='image/*,video/*,.pdf,.doc,.docx,.txt,.md'
              className='hidden'
              onChange={handleFileChange}
            />

            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className='size-4 me-1' />
              <Trans>Add files</Trans>
            </Button>
          </div>
          </div>
          <ResponsiveDialogFooter className='gap-2 pt-4'>
            <ResponsiveDialogClose asChild>
              <Button type='button' variant='outline' disabled={isSubmitting}>
                <Trans>Cancel</Trans>
              </Button>
            </ResponsiveDialogClose>
            <Button type='submit' disabled={!form.feedId || !hasContent || form.files.some(f => f.size > MAX_FILE_SIZE) || isSubmitting}>
              {isSubmitting ? <Loader2 className='size-4 animate-spin' /> : <Send className='size-4' />}
              {isSubmitting ? <Trans>Posting…</Trans> : <Trans>Post</Trans>}
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
    <PlacePicker
      open={placePickerMode !== null}
      onOpenChange={(open) => !open && setPlacePickerMode(null)}
      onSelect={handlePlaceSelect}
      title={getPlacePickerTitle()}
    />
    <TravellingPicker
      open={travellingPickerOpen}
      onOpenChange={setTravellingPickerOpen}
      onSelect={handleTravellingSelect}
    />
    </>
  )
}
