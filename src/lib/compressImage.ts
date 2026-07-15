/** Resize + JPEG-compress an image File to a data URL for school logo / cover upload. */
export async function compressImageFile(
  file: File,
  opts: { maxEdge?: number; quality?: number } = {},
): Promise<string> {
  const maxEdge = opts.maxEdge ?? 1280
  const quality = opts.quality ?? 0.82
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not prepare image')
    ctx.drawImage(bitmap, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    bitmap.close()
  }
}
