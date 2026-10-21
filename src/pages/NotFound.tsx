import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="text-xl font-semibold text-slate-900">Página no encontrada</h1>
      <Link to="/" className="btn-primary">
        Volver al inicio
      </Link>
    </div>
  )
}
