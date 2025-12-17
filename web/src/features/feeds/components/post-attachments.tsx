import { useState } from 'react'
import { File, FileText, Image } from 'lucide-react'
import { ImageLightbox, type LightboxImage } from '@mochi/common'
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

  const images = attachments.filter((att) => isImage(att.type))
  const files = attachments.filter((att) => !isImage(att.type))

  // Build lightbox images array
  const lightboxImages: LightboxImage[] = images.map((att) => ({
    id: att.id,
    name: att.name,
    url: getAttachmentUrl(att.id),
  }))

  const openLightbox = (index: number) => {
    setCurrentIndex(index)
    setLightboxOpen(true)
  }

  return (
    <div className='space-y-3'>
      {/* Image grid */}
      {images.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {images.map((attachment, index) => (
            <button
              key={attachment.id}
              type='button'
              onClick={() => openLightbox(index)}
              className='group overflow-hidden rounded-lg border bg-muted'
            >
              <img
                src={getThumbnailUrl(attachment.id)}
                alt={attachment.name}
                className='max-h-[250px] transition-transform group-hover:scale-105'
              />
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

      {/* Image lightbox */}
      <ImageLightbox
        images={lightboxImages}
        currentIndex={currentIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={setCurrentIndex}
      />
    </div>
  )
}
