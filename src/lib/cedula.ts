export function isValidEcuadorianId(value: string): boolean {
  const cedula = (value ?? '').trim()
  if (!/^[0-9]{10}$/.test(cedula)) return false
  const province = parseInt(cedula.slice(0, 2), 10)
  const isForeigner = province === 30
  if (!isForeigner && (province < 1 || province > 24)) return false
  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2]
  let sum = 0
  for (let i = 0; i < 9; i += 1) {
    let product = parseInt(cedula[i], 10) * coefficients[i]
    if (product > 9) product -= 9
    sum += product
  }
  const check = (10 - (sum % 10)) % 10
  return check === parseInt(cedula[9], 10)
}
