import { useState } from 'react'
import { File, FileText, Image, Loader2, Play } from 'lucide-react'
import { ImageLightbox, type LightboxMedia, useVideoThumbnailCached, formatVideoDuration } from '@mochi/common'
import type { Attachment } from '@/types'

type PostAttachmentsProps = {
  attachments: Attachment[]
  feedId: string
  isRemote?: boolean
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return Image
  if (type.startsWith('text/')) return FileText
  return File
}

function isImage(type: string): boolean {
  return type.startsWith('image/')
}

function isVideo(type: string): boolean {
  return type.startsWith('video/')
}

// Component to render video thumbnail using the hook
function VideoThumbnail({ url }: { url: string }) {
  const { url: thumbnailUrl, loading, error, duration } = useVideoThumbnailCached(url)

  if (loading) {
    return (
      <div className='flex h-[150px] w-[200px] items-center justify-center bg-muted'>
        <Loader2 className='size-8 animate-spin text-muted-foreground' />
      </div>
    )
  }

  if (error || !thumbnailUrl) {
    return (
      <div className='flex h-[150px] w-[200px] items-center justify-center bg-muted'>
        <Play className='size-12 text-muted-foreground' />
      </div>
    )
  }

  return (
    <div className='relative'>
      <img
        src={thumbnailUrl}
        alt='Video thumbnail'
        className='h-[150px] w-auto object-cover transition-transform group-hover:scale-105'
      />
      <div className='absolute inset-0 flex items-center justify-center'>
        <div className='rounded-full bg-black/50 p-3'>
          <Play className='size-8 text-white' />
        </div>
      </div>
      {duration != null && (
        <div className='absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white'>
          {formatVideoDuration(duration)}
        </div>
      )}
    </div>
  )
}

export function PostAttachments({ attachments, feedId, isRemote = false }: PostAttachmentsProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)

  if (!attachments || attachments.length === 0) {
    return null
  }

  // Build attachment URL - use remote endpoint for non-subscribed feeds
  const getAttachmentUrl = (attachmentId: string) => {
    if (isRemote) {
      return `/feeds/_/attachment/remote?feed=${feedId}&attachment=${attachmentId}`
    }
    return `/feeds/${feedId}/-/attachments/${attachmentId}`
  }

  // Build thumbnail URL for images
  const getThumbnailUrl = (attachmentId: string) => {
    if (isRemote) {
      return `/feeds/_/attachment/remote?feed=${feedId}&attachment=${attachmentId}&thumbnail=1`
    }
    return `/feeds/${feedId}/-/attachments/${attachmentId}/thumbnail`
  }

  // Separate media (images + videos) from other files
  const media = attachments.filter((att) => isImage(att.type) || isVideo(att.type))
  const files = attachments.filter((att) => !isImage(att.type) && !isVideo(att.type))

  // Build lightbox media array
  const lightboxMedia: LightboxMedia[] = media.map((att) => ({
    id: att.id,
    name: att.name,
    url: getAttachmentUrl(att.id),
    type: isVideo(att.type) ? 'video' : 'image',
  }))

  const openLightbox = (index: number) => {
    setCurrentIndex(index)
    setLightboxOpen(true)
  }

  return (
    <div className='space-y-3'>
      {/* Media grid (images and videos) */}
      {media.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {media.map((attachment, index) => (
            <button
              key={attachment.id}
              type='button'
              onClick={() => openLightbox(index)}
              className='group relative overflow-hidden rounded-lg border bg-muted'
            >
              {isVideo(attachment.type) ? (
                <VideoThumbnail url={getAttachmentUrl(attachment.id)} />
              ) : (
                <img
                  src={getThumbnailUrl(attachment.id)}
                  alt={attachment.name}
                  className='max-h-[250px] transition-transform group-hover:scale-105'
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className='space-y-1'>
          {files.map((attachment) => {
            const FileIcon = getFileIcon(attachment.type)
            return (
              <a
                key={attachment.id}
                href={getAttachmentUrl(attachment.id)}
                className='flex items-center gap-2 rounded-lg border p-2 text-sm transition-colors hover:bg-muted'
              >
                <FileIcon className='size-4 shrink-0 text-muted-foreground' />
                <span className='min-w-0 flex-1 truncate'>{attachment.name}</span>
                <span className='shrink-0 text-xs text-muted-foreground'>
                  {formatFileSize(attachment.size)}
                </span>
              </a>
            )
          })}
        </div>
      )}

      {/* Media lightbox */}
      <ImageLightbox
        images={lightboxMedia}
        currentIndex={currentIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={setCurrentIndex}
      />
    </div>
  )
}
