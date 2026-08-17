import PocketBase from 'pocketbase'

// In production PocketBase serves the built app itself, so the API lives on
// the same origin. In dev, Vite proxies /api to 127.0.0.1:8090 (see vite.config.ts).
export const pb = new PocketBase(
  import.meta.env.DEV ? 'http://127.0.0.1:8090' : window.location.origin,
)

pb.autoCancellation(false)

export interface BoardRecord {
  id: string
  name: string
  owner: string
  created: string
  updated: string
}

export interface ItemRecord {
  id: string
  board: string
  title: string
  price: string
  url: string
  image: string
  image_url: string
  x: number
  y: number
  w: number
  note: string
  bought: boolean
  created: string
  updated: string
}

export interface OgPreview {
  title: string
  image: string
  price: string
  currency: string
  siteName: string
  description: string
}

export function itemImageUrl(item: ItemRecord, thumb = ''): string {
  if (!item.image) return ''
  return pb.files.getURL(item as never, item.image, thumb ? { thumb } : undefined)
}

/** Fetch Open Graph metadata for a product/shop URL via the server hook. */
export async function fetchOgPreview(url: string): Promise<OgPreview> {
  return await pb.send('/api/og-preview', { query: { url } })
}

/**
 * Download a remote image through the same-origin proxy so it can be stored
 * as a durable file on the item. Returns null when the download fails —
 * callers then fall back to keeping just the metadata.
 */
export async function downloadImage(url: string): Promise<File | null> {
  try {
    const res = await fetch(`${pb.baseURL}/api/img?url=${encodeURIComponent(url)}`, {
      headers: { Authorization: pb.authStore.token },
    })
    if (!res.ok) return null
    const type = res.headers.get('content-type') || 'image/jpeg'
    if (!type.startsWith('image/')) return null
    const blob = await res.blob()
    const ext = (type.split('/')[1] || 'jpg').split(';')[0].replace('jpeg', 'jpg')
    return new File([blob], `product.${ext}`, { type })
  } catch {
    return null
  }
}

/** Extract the first http(s) URL from arbitrary shared/pasted text. */
export function extractUrl(text: string): string {
  const m = text.match(/https?:\/\/[^\s"'<>]+/i)
  return m ? m[0] : ''
}

export function formatPrice(price: string, currency: string): string {
  if (!price) return ''
  if (!currency) return price
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    RON: 'lei',
    JPY: '¥',
  }
  const sym = symbols[currency.toUpperCase()]
  return sym ? `${sym}${price}` : `${price} ${currency}`
}
