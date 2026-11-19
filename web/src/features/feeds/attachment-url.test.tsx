// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
// An attachment's id can come from another server, and the page puts it into
// an address its token goes on: each id is one encoded segment, and an
// attachment whose id cannot be one is left out rather than fetched.
import type { Attachment } from '@/types'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { attachmentAddress } from './attachment-url'
import { CommentAttachments } from './components/comment-attachments'
import { PostAttachments } from './components/post-attachments'

type GalleryProps = {
  attachments: Attachment[]
  getUrl: (att: Attachment) => string
  getThumbnailUrl?: (att: Attachment) => string
  getPreviewUrl?: (att: Attachment) => string
  getMediumUrl?: (att: Attachment) => string
}

// The gallery is the library's; what matters here is what each component
// hands it.
vi.mock('@mochi/web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mochi/web')>()
  return {
    ...actual,
    AttachmentGallery: ({
      attachments,
      getUrl,
      getThumbnailUrl,
      getPreviewUrl,
      getMediumUrl,
    }: GalleryProps) => (
      <ul>
        {attachments.map((att) => (
          <li
            key={att.id}
            data-testid='attachment'
            data-url={getUrl(att)}
            data-thumbnail={getThumbnailUrl?.(att) ?? ''}
            data-preview={getPreviewUrl?.(att) ?? ''}
            data-medium={getMediumUrl?.(att) ?? ''}
          />
        ))}
      </ul>
    ),
  }
})

const file = (id: string) =>
  ({ id, name: 'cat.png', size: 10, type: 'image/png' }) as Attachment

const hostile = [file('../delete?x='), file('x/delete'), file('..')]

function items(container: HTMLElement) {
  return [...container.querySelectorAll('[data-testid="attachment"]')].map(
    (item) => ({
      url: item.getAttribute('data-url'),
      thumbnail: item.getAttribute('data-thumbnail'),
      preview: item.getAttribute('data-preview'),
      medium: item.getAttribute('data-medium'),
    })
  )
}

describe('attachmentAddress', () => {
  it('encodes the id as one segment', () => {
    expect(attachmentAddress('f1', 'a?b#c')).toBe('/f1/-/attachments/a%3Fb%23c')
    expect(attachmentAddress('f1', 'a1', 'thumbnail')).toBe(
      '/f1/-/attachments/a1/thumbnail'
    )
  })

  it.each([['../delete?x='], ['x/delete'], ['..'], ['']])(
    'gives no address for %j',
    (id) => {
      expect(attachmentAddress('f1', id)).toBeUndefined()
      expect(attachmentAddress('f1', id, 'medium')).toBeUndefined()
    }
  )
})

describe('attachment galleries', () => {
  it('post gallery addresses every variant from the encoded id and leaves out the rest', () => {
    const { container } = render(
      <PostAttachments attachments={[file('a?b'), ...hostile]} feedId='f1' />
    )
    expect(items(container)).toEqual([
      {
        url: '/f1/-/attachments/a%3Fb',
        thumbnail: '/f1/-/attachments/a%3Fb/thumbnail',
        preview: '/f1/-/attachments/a%3Fb/preview',
        medium: '/f1/-/attachments/a%3Fb/medium',
      },
    ])
  })

  it('comment gallery does the same', () => {
    const { container } = render(
      <CommentAttachments attachments={[file('a?b'), ...hostile]} feedId='f1' />
    )
    expect(items(container)).toEqual([
      {
        url: '/f1/-/attachments/a%3Fb',
        thumbnail: '/f1/-/attachments/a%3Fb/thumbnail',
        preview: '',
        medium: '',
      },
    ])
  })

  it('comment gallery shows nothing when no attachment can be addressed', () => {
    const { container } = render(
      <CommentAttachments attachments={hostile} feedId='f1' />
    )
    expect(container.innerHTML).toBe('')
  })
})
