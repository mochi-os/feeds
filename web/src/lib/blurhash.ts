// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
//
// A blurhash is the few-character placeholder Mastodon and its kin attach to
// a picture: a handful of DCT coefficients from which a blurred version is
// drawn before the picture loads, and in place of it while it is marked
// sensitive. This decodes one to pixels (the reference algorithm from
// blurha.sh), small enough to hold here rather than depend on a package.

const ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~'

function decode83(text: string): number {
  let value = 0
  for (const character of text) {
    const digit = ALPHABET.indexOf(character)
    if (digit < 0) return 0
    value = value * 83 + digit
  }
  return value
}

function toLinear(value: number): number {
  const v = value / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function toSrgb(value: number): number {
  const v = Math.max(0, Math.min(1, value))
  return Math.round(
    (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255
  )
}

function signPow(value: number, exponent: number): number {
  return Math.sign(value) * Math.pow(Math.abs(value), exponent)
}

/** Whether a string is a blurhash this decoder can read. */
export function isBlurhash(hash: string | undefined): hash is string {
  if (!hash || hash.length < 6) return false
  const size = decode83(hash[0])
  const components = (Math.floor(size / 9) + 1) * ((size % 9) + 1)
  return hash.length === 4 + 2 * components
}

/**
 * The pixels of a blurhash at the size given, as RGBA bytes for an ImageData.
 * Returns null for a string that is not a blurhash.
 */
export function decodeBlurhash(
  hash: string,
  width: number,
  height: number,
  punch = 1
): Uint8ClampedArray | null {
  if (!isBlurhash(hash)) return null
  const size = decode83(hash[0])
  const columns = (size % 9) + 1
  const rows = Math.floor(size / 9) + 1
  const maximum = ((decode83(hash[1]) + 1) / 166) * punch
  const colours: [number, number, number][] = []
  for (let i = 0; i < columns * rows; i++) {
    if (i === 0) {
      const value = decode83(hash.substring(2, 6))
      colours.push([
        toLinear(value >> 16),
        toLinear((value >> 8) & 255),
        toLinear(value & 255),
      ])
    } else {
      const value = decode83(hash.substring(4 + i * 2, 6 + i * 2))
      colours.push([
        signPow((Math.floor(value / (19 * 19)) - 9) / 9, 2) * maximum,
        signPow((Math.floor(value / 19) % 19 - 9) / 9, 2) * maximum,
        signPow(((value % 19) - 9) / 9, 2) * maximum,
      ])
    }
  }
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < columns; i++) {
          const basis =
            Math.cos((Math.PI * x * i) / width) *
            Math.cos((Math.PI * y * j) / height)
          const colour = colours[i + j * columns]
          r += colour[0] * basis
          g += colour[1] * basis
          b += colour[2] * basis
        }
      }
      const at = 4 * (x + y * width)
      pixels[at] = toSrgb(r)
      pixels[at + 1] = toSrgb(g)
      pixels[at + 2] = toSrgb(b)
      pixels[at + 3] = 255
    }
  }
  return pixels
}
