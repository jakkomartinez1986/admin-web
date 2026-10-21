/** Validación de RUC ecuatoriano (13 dígitos, provincia 01–24 o 06/09 especiales). */
export function isValidEcuadorianRuc(value: string): boolean {
  const ruc = (value ?? '').trim()
  if (!/^[0-9]{13}$/.test(ruc)) return false
  const province = parseInt(ruc.slice(0, 2), 10)
  // Provincias válidas (01–24) más prefijos especiales: 06 (público), 09 (jurídicas viejas).
  if (province === 6 || province === 9) return true
  return province >= 1 && province <= 24
}
