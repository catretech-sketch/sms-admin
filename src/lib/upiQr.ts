/** Offline UPI collect — build pay URI + QR image for desk scanning. */

export function buildUpiPayUri(opts: {
  pa: string
  am: number
  pn?: string
  tn?: string
  cu?: string
}): string {
  const pa = opts.pa.trim()
  if (!pa) return ''
  const am = Math.max(0, Number(opts.am) || 0)
  const params = new URLSearchParams()
  params.set('pa', pa)
  params.set('am', am.toFixed(2))
  params.set('cu', (opts.cu || 'INR').trim() || 'INR')
  if (opts.pn?.trim()) params.set('pn', opts.pn.trim())
  if (opts.tn?.trim()) params.set('tn', opts.tn.trim())
  return `upi://pay?${params.toString()}`
}

export function upiQrImageUrl(upiUri: string, size = 180): string {
  const data = encodeURIComponent(upiUri)
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${data}`
}
