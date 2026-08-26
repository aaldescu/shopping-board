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

export interface ActivityEvent {
  t: string
  event: string
  detail?: string
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
  activity: ActivityEvent[]
  created: string
  updated: string
}

export interface ItemEvent {
  id: string
  item: string
  board: string
  event: string
  field: string
  from: string
  to: string
  detail: string
  source: string
  created: string
}

/** Load the audit trail for one item, newest first. */
export async function fetchItemEvents(itemId: string): Promise<ItemEvent[]> {
  const res = await pb.collection('item_events').getList<ItemEvent>(1, 100, {
    filter: pb.filter('item = {:id}', { id: itemId }),
    sort: '-created',
  })
  return res.items
}

export interface TraceStep {
  step: string
  [key: string]: unknown
}

export interface OgPreview {
  title: string
  image: string
  price: string
  currency: string
  siteName: string
  description: string
  trace?: TraceStep[]
}

export function itemImageUrl(item: ItemRecord, thumb = ''): string {
  if (!item.image) return ''
  return pb.files.getURL(item as never, item.image, thumb ? { thumb } : undefined)
}

/** Fetch Open Graph metadata for a product/shop URL via the server hook. */
export async function fetchOgPreview(url: string): Promise<OgPreview> {
  return await pb.send('/api/og-preview', { query: { url } })
}

export interface ImageDownload {
  file: File | null
  reason: string
}

/**
 * Download a remote image through the same-origin proxy so it can be stored
 * as a durable file on the item. Returns the file plus a human-readable
 * reason string ('ok' on success) so callers can log why it failed.
 */
export async function downloadImage(url: string): Promise<ImageDownload> {
  try {
    const res = await fetch(`${pb.baseURL}/api/img?url=${encodeURIComponent(url)}`, {
      headers: { Authorization: pb.authStore.token },
    })
    if (!res.ok) {
      let detail = `proxy status ${res.status}`
      try {
        const body = await res.json()
        if (body?.error) detail = body.error
      } catch {
        /* non-JSON error body */
      }
      return { file: null, reason: detail }
    }
    const type = res.headers.get('content-type') || 'image/jpeg'
    if (!type.startsWith('image/')) return { file: null, reason: `not an image (${type})` }
    const blob = await res.blob()
    const ext = (type.split('/')[1] || 'jpg').split(';')[0].replace('jpeg', 'jpg')
    return { file: new File([blob], `product.${ext}`, { type }), reason: 'ok' }
  } catch (err) {
    return { file: null, reason: `network error: ${String(err)}` }
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
