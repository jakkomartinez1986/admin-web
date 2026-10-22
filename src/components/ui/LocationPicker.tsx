/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Crosshair, Search, X } from 'lucide-react'
import { Modal } from './Modal'

const DEFAULT_CENTER = { lat: -0.18, lng: -78.47 }
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? 'AIzaSyAgqBjLnKlH_5oaPEoxt267aDElA8kk8YE'

declare global {
  interface Window {
    google?: any
  }
}

interface LocationPickerProps {
  open: boolean
  title?: string
  initialLat: number | null
  initialLng: number | null
  onClose: () => void
  onConfirm: (lat: number, lng: number) => void
}

export function LocationPicker({ open, title = 'Seleccionar ubicación', initialLat, initialLng, onClose, onConfirm }: LocationPickerProps) {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const googleMapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const autocompleteRef = useRef<any>(null)
  const [lat, setLat] = useState<number | null>(initialLat)
  const [lng, setLng] = useState<number | null>(initialLng)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const loadedRef = useRef<boolean>(false)

  const loadScript = useCallback(() => {
    if (window.google?.maps?.places) {
      loadedRef.current = true
      return Promise.resolve()
    }

    loadedRef.current = true
    return new Promise<void>((resolve, reject) => {
      const existing = Array.from(document.scripts).find((s) => s.src.includes('maps.googleapis.com/maps/api/js'))
      if (existing && window.google?.maps && !window.google?.maps.places) {
        existing.remove()
        loadedRef.current = false
        if (window.google) {
          delete (window as any).google
        }
      }

      const script = document.createElement('script')
      script.src = 'https://maps.googleapis.com/maps/api/js?key=' + API_KEY + '&libraries=places&loading=async'
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => reject()
      document.head.appendChild(script)
    })
  }, [])

  const initMap = useCallback(() => {
    if (!mapRef.current || !window.google?.maps) return
    const center = initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : DEFAULT_CENTER
    const map = new window.google.maps.Map(mapRef.current, {
      center,
      zoom: initialLat != null ? 17 : 14,
      mapTypeId: 'roadmap',
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: window.google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
        position: window.google.maps.ControlPosition.TOP_RIGHT,
        mapTypeIds: ['roadmap', 'satellite', 'hybrid', 'terrain'],
      },
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
    })
    googleMapRef.current = map
    const marker = new window.google.maps.Marker({ position: center, map, draggable: true, animation: window.google.maps.Animation.DROP })
    markerRef.current = marker
    marker.addListener('dragend', () => {
      const pos = marker.getPosition()
      if (pos) {
        setLat(pos.lat())
        setLng(pos.lng())
      }
    })
    map.addListener('click', (e: any) => {
      if (!e.latLng) return
      marker.setPosition(e.latLng)
      setLat(e.latLng.lat())
      setLng(e.latLng.lng())
    })
    if (initialLat != null && initialLng != null) {
      setLat(initialLat)
      setLng(initialLng)
    }
    if (searchInputRef.current && window.google.maps.places) {
      const autocomplete = new window.google.maps.places.Autocomplete(searchInputRef.current, {
        fields: ['geometry', 'name', 'formatted_address'],
        componentRestrictions: { country: ['ec'] },
      })
      autocomplete.bindTo('bounds', map)
      autocompleteRef.current = autocomplete
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace()
        if (!place.geometry || !place.geometry.location) return
        const location = place.geometry.location
        map.setCenter(location)
        map.setZoom(18)
        marker.setPosition(location)
        setLat(location.lat())
        setLng(location.lng())
        setSearchQuery(place.formatted_address || place.name || '')
      })
    } else if (searchInputRef.current) {
      setGeoError('No se pudo cargar la búsqueda de direcciones (Places API).')
    }
  }, [initialLat, initialLng])

  useEffect(() => {
    if (!open) return
    setGeoError(null)
    setLocating(false)
    setLat(initialLat)
    setLng(initialLng)
    setSearchQuery('')
    loadScript()
      .then(initMap)
      .catch(() => setGeoError('No se pudo cargar Google Maps'))
    const timer = window.setTimeout(() => {
      if (googleMapRef.current && window.google?.maps?.event) {
        window.google.maps.event.trigger(googleMapRef.current, 'resize')
      }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [open, initialLat, initialLng, loadScript, initMap])

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('El navegador no soporta geolocalización.')
      return
    }
    setLocating(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = pos.coords.latitude
        const ln = pos.coords.longitude
        const p = { lat: la, lng: ln }
        markerRef.current?.setPosition(p)
        googleMapRef.current?.setCenter(p)
        googleMapRef.current?.setZoom(18)
        setLat(la)
        setLng(ln)
        setSearchQuery('')
        setLocating(false)
      },
      (err) => {
        setGeoError(err.message || 'No se pudo obtener ubicación')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const handleClear = () => {
    setLat(null)
    setLng(null)
    setSearchQuery('')
    if (searchInputRef.current) searchInputRef.current.value = ''
  }

  const handleConfirm = () => {
    if (lat != null && lng != null) onConfirm(lat, lng)
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={handleClear}>
            Limpiar
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" onClick={handleConfirm} disabled={lat == null || lng == null}>
            <Check className="h-4 w-4" />
            Usar esta ubicación
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Busca un sitio, haz clic o arrastra el pin. Usa los controles para cambiar vista.
          </p>
          <button type="button" className="btn-secondary whitespace-nowrap" onClick={useMyLocation} disabled={locating}>
            <Crosshair className="h-4 w-4" />
            {locating ? 'Localizando…' : 'Usar mi ubicación'}
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar dirección, calle, local, etc."
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-9 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-slate-600"
              onClick={() => {
                setSearchQuery('')
                if (searchInputRef.current) searchInputRef.current.value = ''
              }}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {geoError && (
          <div role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {geoError}
          </div>
        )}

        <div ref={mapRef} className="h-80 w-full overflow-hidden rounded-xl border border-slate-200" />

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-slate-400">Latitud</p>
            <p className="font-mono text-slate-700">{lat != null ? lat.toFixed(6) : '—'}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-slate-400">Longitud</p>
            <p className="font-mono text-slate-700">{lng != null ? lng.toFixed(6) : '—'}</p>
          </div>
        </div>
      </div>
    </Modal>
  )
}
