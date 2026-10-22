/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Crosshair } from 'lucide-react'
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
  const [lat, setLat] = useState<number | null>(initialLat)
  const [lng, setLng] = useState<number | null>(initialLng)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const loadedRef = useRef<boolean>(false)

  const loadScript = useCallback(() => {
    if (loadedRef.current || window.google?.maps) return Promise.resolve()
    loadedRef.current = true
    return new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://maps.googleapis.com/maps/api/js?key=' + API_KEY + '&libraries=places'
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
    })
    googleMapRef.current = map
    const marker = new window.google.maps.Marker({ position: center, map, draggable: true })
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
  }, [initialLat, initialLng])

  useEffect(() => {
    if (!open) return
    setGeoError(null)
    setLocating(false)
    setLat(initialLat)
    setLng(initialLng)
    loadScript()
      .then(initMap)
      .catch(() => setGeoError('No se pudo cargar Google Maps'))
    const timer = window.setTimeout(() => window.google?.maps?.event?.trigger(googleMapRef.current, 'resize'), 300)
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
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            Haz clic o arrastra el pin. Usa los botones para cambiar entre mapa, satélite o híbrido.
          </p>
          <button type="button" className="btn-secondary whitespace-nowrap" onClick={useMyLocation} disabled={locating}>
            <Crosshair className="h-4 w-4" />
            {locating ? 'Localizando…' : 'Usar mi ubicación'}
          </button>
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
