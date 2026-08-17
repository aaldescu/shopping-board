import { useEffect, useRef, useState } from 'react'
import {
  downloadImage,
  fetchOgPreview,
  formatPrice,
  itemImageUrl,
  pb,
  type ItemRecord,
} from '../lib/pb'

export interface DialogState {
  mode: 'add' | 'edit'
  item?: ItemRecord
  prefillUrl?: string
  /** World coordinates where a newly added card should appear. */
  spawn?: { x: number; y: number }
}

interface Props {
  state: DialogState
  boardId: string
  onClose: () => void
  onSaved: (item: ItemRecord) => void
  /** Quick add: create the card immediately, fetch details in the background. */
  onQuickAdd?: (url: string) => void
}

export default function ItemDialog({ state, boardId, onClose, onSaved, onQuickAdd }: Props) {
  const editing = state.mode === 'edit' ? state.item : undefined

  // Add mode starts as a minimal "paste a link" view unless prefilled.
  const [expanded, setExpanded] = useState(state.mode === 'edit' || !!state.prefillUrl)
  const [url, setUrl] = useState(editing?.url || state.prefillUrl || '')
  const [bought, setBought] = useState(editing?.bought ?? false)
  const [title, setTitle] = useState(editing?.title || '')
  const [price, setPrice] = useState(editing?.price || '')
  const [note, setNote] = useState(editing?.note || '')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState(
    editing ? itemImageUrl(editing) || editing.image_url : '',
  )
  const [remoteImageUrl, setRemoteImageUrl] = useState(editing?.image_url || '')
  const [clearImage, setClearImage] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const autoFetchedRef = useRef(false)

  useEffect(() => {
    if (state.mode === 'add' && state.prefillUrl && !autoFetchedRef.current) {
      autoFetchedRef.current = true
      void fetchDetails(state.prefillUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchDetails(target?: string) {
    const u = (target ?? url).trim()
    if (!/^https?:\/\//i.test(u)) {
      setError('Enter a full product URL (starting with http:// or https://).')
      return
    }
    setError('')
    setFetching(true)
    try {
      const preview = await fetchOgPreview(u)
      if (preview.title && !title) setTitle(preview.title)
      if (preview.price && !price) setPrice(formatPrice(preview.price, preview.currency))
      if (preview.image) {
        setRemoteImageUrl(preview.image)
        setClearImage(false)
        const file = await downloadImage(preview.image)
        if (file) {
          setImageFile(file)
          setImagePreview(URL.createObjectURL(file))
        } else {
          // Could not proxy the image — fall back to hotlinking it.
          setImageFile(null)
          setImagePreview(preview.image)
        }
      }
      if (!preview.title && !preview.image && !preview.price) {
        setError('No product details found on that page — fill them in manually.')
      }
    } catch {
      setError('Could not read that page. You can still fill in the details manually.')
    } finally {
      setFetching(false)
    }
  }

  function onPickFile(file: File | null) {
    if (!file || !file.type.startsWith('image/')) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setRemoteImageUrl('')
    setClearImage(false)
  }

  function removeImage() {
    setImageFile(null)
    setImagePreview('')
    setRemoteImageUrl('')
    setClearImage(true)
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const fd = new FormData()
      fd.set('title', title.trim())
      fd.set('price', price.trim())
      fd.set('url', url.trim())
      fd.set('note', note.trim())
      fd.set('image_url', imageFile ? '' : remoteImageUrl)
      if (imageFile) fd.set('image', imageFile)
      else if (clearImage) fd.set('image', '')
      if (state.mode === 'edit') fd.set('bought', bought ? 'true' : 'false')

      let saved: ItemRecord
      if (state.mode === 'add') {
        fd.set('board', boardId)
        fd.set('x', String(Math.round(state.spawn?.x ?? 0)))
        fd.set('y', String(Math.round(state.spawn?.y ?? 0)))
        fd.set('w', '260')
        saved = await pb.collection('items').create<ItemRecord>(fd)
      } else {
        saved = await pb.collection('items').update<ItemRecord>(editing!.id, fd)
      }
      onSaved(saved)
      onClose()
    } catch {
      setError('Saving failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function submitQuick(value?: string) {
    const u = (value ?? url).trim()
    if (!/^https?:\/\//i.test(u)) {
      setError('Paste a full product URL (starting with http:// or https://).')
      return
    }
    if (onQuickAdd) onQuickAdd(u)
    else setExpanded(true)
  }

  if (!expanded) {
    return (
      <div
        className="dialog-backdrop"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div className="dialog" role="dialog" aria-modal="true">
          <h2>Add to board</h2>
          <div className="field">
            <label>Product / shop URL</label>
            <input
              className="input"
              type="url"
              autoFocus
              placeholder="https://shop.example.com/product…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text').trim()
                if (/^https?:\/\//i.test(pasted)) {
                  e.preventDefault()
                  submitQuick(pasted)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submitQuick()
                }
              }}
            />
            <p className="muted">
              Paste a link and the card is added right away — details load in the background.
            </p>
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="dialog-actions" style={{ justifyContent: 'space-between' }}>
            <button className="btn btn-ghost" onClick={() => setExpanded(true)}>
              More options
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!/^https?:\/\//i.test(url.trim())}
                onClick={() => submitQuick()}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="dialog-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true">
        <h2>{state.mode === 'add' ? 'Add to board' : 'Edit item'}</h2>

        <div className="field">
          <label>Product / shop URL</label>
          <div className="url-fetch-row">
            <input
              className="input"
              type="url"
              placeholder="https://shop.example.com/product…"
              value={url}
              autoFocus={state.mode === 'add' && !state.prefillUrl}
              onChange={(e) => setUrl(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text').trim()
                if (/^https?:\/\//i.test(pasted) && !title && !imagePreview) {
                  setTimeout(() => void fetchDetails(pasted), 0)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void fetchDetails()
                }
              }}
            />
            <button
              className="btn"
              type="button"
              disabled={fetching || !url.trim()}
              onClick={() => void fetchDetails()}
            >
              {fetching ? <span className="spinner" /> : 'Fetch'}
            </button>
          </div>
        </div>

        {imagePreview ? (
          <div className="preview-img-wrap">
            <img className="preview-img" src={imagePreview} alt="" referrerPolicy="no-referrer" />
            <button className="preview-img-remove" title="Remove image" onClick={removeImage}>
              ✕
            </button>
          </div>
        ) : (
          <div className="field">
            <label>Picture</label>
            <button
              className="btn"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              📷 Upload a picture
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
          </div>
        )}

        <div className="field">
          <label>Title</label>
          <input
            className="input"
            placeholder="What is it?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Price</label>
          <input
            className="input"
            placeholder="e.g. €49.99"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Note</label>
          <input
            className="input"
            placeholder="Optional note…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {state.mode === 'edit' && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={bought}
              onChange={(e) => setBought(e.target.checked)}
            />
            I bought it ✓
          </label>
        )}

        {error && <p className="error-text">{error}</p>}

        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={saving || fetching || (!title.trim() && !imagePreview && !url.trim())}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : state.mode === 'add' ? 'Add to board' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
