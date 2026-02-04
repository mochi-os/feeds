import { useEffect, useState, useRef } from 'react'
import {
  Button,
  Label,
  MapView,
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
  Textarea,
  TravellingPicker,
  type PlaceData,
  type PostData,
} from '@mochi/common'
import type { FeedSummary } from '@/types'
import { ArrowLeft, ArrowRight, FilePlus2, MapPin, Paperclip, Plane, Send, X } from 'lucide-react'

type NewPostDialogProps = {
  feeds: FeedSummary[]
  onSubmit: (input: { feedId: string; body: string; data?: PostData; files: File[] }) => void
  /** Controlled open state */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Hide the trigger button (use when controlled externally) */
  hideTrigger?: boolean
}

type NewPostFormState = {
  feedId: string
  body: string
  data: PostData
  files: File[]
}

type PlacePickerMode = 'checkin' | null

const MAX_FILE_SIZE = 1024 * 1024 * 1024 // 1GB

export function NewPostDialog({ feeds, onSubmit, open, onOpenChange, hideTrigger }: NewPostDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [placePickerMode, setPlacePickerMode] = useState<PlacePickerMode>(null)
  const [travellingPickerOpen, setTravellingPickerOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Use controlled state if provided, otherwise use internal state
  const isOpen = open !== undefined ? open : internalOpen
  const setIsOpen = onOpenChange ?? setInternalOpen

  const [form, setForm] = useState<NewPostFormState>(() => ({
    feedId: feeds[0]?.id ?? '',
    body: '',
    data: {},
    files: [],
  }))

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

  const removeAttachment = (index: number) => {
    setForm((prev) => ({ ...prev, files: prev.files.filter((_, i) => i !== index) }))
  }

  const moveAttachment = (index: number, direction: 'left' | 'right') => {
    setForm((prev) => {
      const newIndex = direction === 'left' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= prev.files.length) return prev
      const newArr = [...prev.files]
      ;[newArr[index], newArr[newIndex]] = [newArr[newIndex], newArr[index]]
      return { ...prev, files: newArr }
    })
  }

  // Check if travelling data is complete (both origin and destination have names)
  const hasTravelling = form.data.travelling?.origin?.name && form.data.travelling?.destination?.name

  // Check if post has content (text, checkin, travelling, or files)
  const hasContent = form.body.trim() || form.data.checkin || hasTravelling || form.files.length > 0

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.feedId || !hasContent) return

    // Build clean data object - only include travelling if complete
    const cleanData: PostData = {}
    if (form.data.checkin) {
      cleanData.checkin = form.data.checkin
    }
    if (hasTravelling) {
      cleanData.travelling = form.data.travelling
    }

    const hasData = Object.keys(cleanData).length > 0
    onSubmit({
      feedId: form.feedId,
      body: form.body,
      data: hasData ? cleanData : undefined,
      files: form.files,
    })
    setForm((prev) => ({ ...prev, body: '', data: {}, files: [] }))
    setIsOpen(false)
  }

  const getPlacePickerTitle = () => {
    return placePickerMode === 'checkin' ? 'Check in' : 'Select location'
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
            New post
          </Button>
        </ResponsiveDialogTrigger>
      )}
      <ResponsiveDialogContent className='sm:max-w-[640px] max-h-[90vh] flex flex-col'>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>New post</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <form className='flex flex-col flex-1 min-h-0' onSubmit={handleSubmit}>
          <div className='space-y-4 overflow-y-auto flex-1 min-h-0 px-1'>
          {feeds.length > 1 && (
            <div className='space-y-2'>
              <Label htmlFor='legacy-post-feed'>Feed</Label>
              <Select
                value={form.feedId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, feedId: value }))}
              >
                <SelectTrigger id='legacy-post-feed' className='w-full justify-between'>
                  <SelectValue placeholder='Choose a feed' />
                </SelectTrigger>
                <SelectContent>
                  {feeds.map((feed) => (
                    <SelectItem key={feed.id} value={feed.id}>
                      {feed.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className='space-y-2'>
            <Label htmlFor='legacy-post-body'>Post content</Label>
            <Textarea
              id='legacy-post-body'
              rows={8}
              placeholder='Markdown supported'
              value={form.body}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, body: event.target.value }))
              }
            />
          </div>

          {/* Location display */}
          {(form.data.checkin || form.data.travelling) && (
            <div className='space-y-2'>
              {form.data.checkin && (
                <div className='rounded-[8px] border p-3 space-y-2'>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2 text-sm'>
                      <MapPin className='size-4 text-blue-500' />
                      <span>at {form.data.checkin.name}</span>
                    </div>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='size-6'
                      onClick={removeCheckin}
                    >
                      <X className='size-4' />
                    </Button>
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
                      <Plane className='size-4 text-blue-600' />
                      <span>
                        {form.data.travelling.origin.name} – {form.data.travelling.destination.name}
                      </span>
                    </div>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='size-6'
                      onClick={removeTravelling}
                    >
                      <X className='size-4' />
                    </Button>
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
              Check-in
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setTravellingPickerOpen(true)}
            >
              <Plane className='size-4' />
              Travelling
            </Button>
          </div>

          {/* Attachments */}
          <div className='space-y-2'>
            {form.files.length > 0 && (
              <>
                <div className='text-xs font-medium text-muted-foreground'>Attachments</div>
                <div className='flex flex-wrap gap-2'>
                  {form.files.map((file, index) => {
                    const isImage = file.type?.startsWith('image/')
                    const previewUrl = isImage ? URL.createObjectURL(file) : undefined
                    const isFirst = index === 0
                    const isLast = index === form.files.length - 1
                    const tooLarge = file.size > MAX_FILE_SIZE

                    return (
                      <div
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                        className={`group/att relative overflow-hidden rounded-[8px] border-2 border-dashed flex items-center justify-center ${tooLarge ? 'border-red-500/50' : 'border-primary/30 bg-muted/50'}`}
                      >
                        {isImage && previewUrl ? (
                          <img
                            src={previewUrl}
                            alt={file.name}
                            className='max-h-[150px] max-w-[200px] block'
                          />
                        ) : (
                          <div className='flex h-[100px] w-[150px] flex-col items-center justify-center gap-1 px-2'>
                            <Paperclip className='size-6 text-muted-foreground' />
                            <span className={`text-xs text-center line-clamp-2 break-all ${tooLarge ? 'text-red-600' : 'text-muted-foreground'}`}>
                              {file.name}
                              {tooLarge && <span className='block text-red-600'>Too large</span>}
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
                              moveAttachment(index, 'left')
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
                              moveAttachment(index, 'right')
                            }}
                          >
                            <ArrowRight className='size-5' />
                          </button>
                          <button
                            type='button'
                            className='size-9 rounded-full bg-white/20 text-white hover:bg-white/30 flex items-center justify-center'
                            onClick={(e) => {
                              e.stopPropagation()
                              removeAttachment(index)
                            }}
                          >
                            <X className='size-5' />
                          </button>
                        </div>
                        {/* Position indicator */}
                        <div className='absolute top-2 left-2 size-6 rounded-full bg-black/60 text-white text-xs font-medium flex items-center justify-center'>
                          {index + 1}
                        </div>
                      </div>
                    )
                  })}
                </div>
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
              <Paperclip className='size-4 mr-1' />
              Add files
            </Button>
          </div>
          </div>
          <ResponsiveDialogFooter className='gap-2 pt-4'>
            <ResponsiveDialogClose asChild>
              <Button type='button' variant='outline'>
                Cancel
              </Button>
            </ResponsiveDialogClose>
            <Button type='submit' disabled={!form.feedId || !hasContent || form.files.some(f => f.size > MAX_FILE_SIZE)}>
              <Send className='size-4' />
              Post
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
