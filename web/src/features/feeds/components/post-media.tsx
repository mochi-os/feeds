// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
//
// The media of a post from another network (phase 17), by their addresses
// there. A sensitive post shows each picture's blurhash until the reader
// chooses to see it; a picture with no blurhash is simply hidden until then.
import { useEffect, useRef, useState } from 'react'
import { Trans } from '@lingui/react/macro'
import { Button, cn, type PostMedia as PostMediaData } from '@mochi/web'
import { Eye, Paperclip } from 'lucide-react'
import { decodeBlurhash, isBlurhash } from '@/lib/blurhash'
import { safeHref } from '../utils'

function Blurhash({
  hash,
  className,
}: {
  hash: string
  className?: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const pixels = decodeBlurhash(hash, 32, 32)
    const context = element.getContext('2d')
    if (!pixels || !context) return
    const image = context.createImageData(32, 32)
    image.data.set(pixels)
    context.putImageData(image, 0, 0)
  }, [hash])
  return (
    <canvas
      ref={canvas}
      width={32}
      height={32}
      className={cn('h-full w-full', className)}
      aria-hidden
    />
  )
}

export function PostMedia({
  media,
  sensitive,
}: {
  media: PostMediaData[]
  sensitive?: boolean
}) {
  const [shown, setShown] = useState(!sensitive)
  const pictures = media.filter((m) => m.type === 'image' || m.type === 'video')
  const files = media.filter((m) => m.type !== 'image' && m.type !== 'video')
  return (
    <div className='my-2 space-y-2' onClick={(event) => event.stopPropagation()}>
      {pictures.length > 0 && (
        <div
          className={cn(
            'grid gap-2',
            pictures.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
          )}
        >
          {pictures.map((item) => (
            <div
              key={item.url}
              className='bg-muted relative aspect-video overflow-hidden rounded-lg'
            >
              {shown ? (
                item.type === 'video' ? (
                  <video
                    src={safeHref(item.url)}
                    controls
                    preload='metadata'
                    className='h-full w-full object-cover'
                  />
                ) : (
                  <a
                    href={safeHref(item.url)}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    <img
                      src={safeHref(item.url)}
                      alt={item.name ?? ''}
                      title={item.name || undefined}
                      loading='lazy'
                      className='h-full w-full object-cover'
                    />
                  </a>
                )
              ) : (
                <>
                  {isBlurhash(item.blurhash) && <Blurhash hash={item.blurhash} />}
                  <div className='absolute inset-0 flex items-center justify-center'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => setShown(true)}
                    >
                      <Eye className='size-4' />
                      <Trans>Show sensitive media</Trans>
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {files.map((item) => (
        <a
          key={item.url}
          href={safeHref(item.url)}
          target='_blank'
          rel='noopener noreferrer'
          className='text-primary flex items-center gap-1.5 text-sm hover:underline'
        >
          <Paperclip className='size-4' />
          {item.name || item.url}
        </a>
      ))}
    </div>
  )
}
