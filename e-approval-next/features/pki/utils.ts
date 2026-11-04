/** 2026-11-04T23:30:00 → 2026.11.04 23:30 */
export function formatCertDate(value: string | null | undefined): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 긴 16진수를 4글자씩 띄어서 보기 좋게 */
export function groupHex(hex: string, size = 4): string {
  return (hex.match(new RegExp(`.{1,${size}}`, 'g')) ?? []).join(' ')
}
