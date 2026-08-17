import { itemImageUrl, type ItemRecord } from '../lib/pb'

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

interface Props {
  item: ItemRecord
  selected: boolean
  dragging: boolean
  /** Quick-added card whose details are still being fetched. */
  pending?: boolean
}

export default function ItemCard({ item, selected, dragging, pending }: Props) {
  const fileUrl = itemImageUrl(item, '512x0')
  const imgSrc = fileUrl || item.image_url
  const domain = domainOf(item.url)

  return (
    <div
      className={
        'item-card' +
        (selected ? ' selected' : '') +
        (dragging ? ' dragging' : '') +
        (item.bought ? ' bought' : '')
      }
      data-item-id={item.id}
      style={{
        left: item.x,
        top: item.y,
        width: item.w || 260,
      }}
    >
      {imgSrc ? (
        <img
          className="item-card-img"
          src={imgSrc}
          alt={item.title || 'product'}
          draggable={false}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : pending ? (
        <div className="item-card-loading">
          <span className="spinner" />
          Fetching details…
        </div>
      ) : (
        <div className="item-card-noimg">🛒</div>
      )}
      {item.bought && <div className="bought-badge">✓ Bought</div>}
      {(item.title || item.price || domain || item.note) && (
        <div className="item-card-body">
          {item.title && <div className="item-card-title">{item.title}</div>}
          {(item.price || domain) && (
            <div className="item-card-row">
              {item.price ? <span className="item-card-price">{item.price}</span> : <span />}
              {domain && <span className="item-card-domain">{domain}</span>}
            </div>
          )}
          {item.note && <div className="item-card-note">{item.note}</div>}
        </div>
      )}
      {selected && <div className="resize-handle" data-resize title="Resize" />}
    </div>
  )
}
