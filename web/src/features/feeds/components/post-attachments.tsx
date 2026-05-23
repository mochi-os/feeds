import { AttachmentGallery, authenticatedUrl, getAppPath, normalizeEntityUrl } from '@mochi/web'
import type { Attachment } from '@/types'

type PostAttachmentsProps = {
  attachments: Attachment[]
  feedId: string
  inline?: boolean
  mediaCap?: number
}

export function PostAttachments({ attachments, feedId, inline = false, mediaCap = 8 }: PostAttachmentsProps) {
  const appPath = getAppPath()

  return (
    <AttachmentGallery
      attachments={attachments}
      getUrl={(att) =>
        authenticatedUrl(normalizeEntityUrl(att.url ?? `${appPath}/${feedId}/-/attachments/${att.id}`))
      }
      getThumbnailUrl={(att) =>
        authenticatedUrl(
          normalizeEntityUrl(att.thumbnail_url ?? `${appPath}/${feedId}/-/attachments/${att.id}/thumbnail`)
        )
      }
      inline={inline}
      mediaCap={mediaCap}
    />
  )
}
