// lib/resultStore.ts
// Simpan OUTPUT/hasil tiap fitur supaya TIDAK hilang saat pindah menu.
//
// Konsep:
//   • Sumber kebenaran = cache di memori (module-level) → selalu selamat saat
//     pindah menu (Next.js client routing hanya unmount komponen, modul tetap hidup).
//   • Backup best-effort ke sessionStorage → selamat juga saat refresh tab.
//     Kalau quota penuh (hasil video bisa besar), backup gagal diam-diam —
//     cache memori tetap jalan, jadi pindah-menu tetap aman.
//
// Aturan refresh:
//   • Output sebuah fitur HANYA ditimpa saat fitur yang SAMA dijalankan lagi.
//   • Menjalankan fitur lain TIDAK menyentuh output fitur ini (key terpisah).

const PREFIX     = "tiktok_result_"
const MAX_AGE_MS = 24 * 60 * 60 * 1000  // 24 jam — hasil lama auto-expire

// Key fitur — satu slot output per fitur.
export type ResultKey = "profile" | "video" | "search" | "analytics"

interface Stored<T> {
  data:    T
  savedAt: number
}

// ── Cache memori (bertahan selama tab terbuka, lintas navigasi) ──────────────
const memory = new Map<ResultKey, Stored<unknown>>()

function storageKey(key: ResultKey): string {
  return PREFIX + key
}

function isFresh(entry: Stored<unknown>): boolean {
  return Date.now() - entry.savedAt <= MAX_AGE_MS
}

// ── Hidrasi awal dari sessionStorage (sekali, saat modul dimuat di client) ───
if (typeof window !== "undefined") {
  try {
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i)
      if (!k || !k.startsWith(PREFIX)) continue
      const raw = window.sessionStorage.getItem(k)
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as Stored<unknown>
        if (parsed && typeof parsed.savedAt === "number" && isFresh(parsed)) {
          memory.set(k.slice(PREFIX.length) as ResultKey, parsed)
        } else {
          window.sessionStorage.removeItem(k)
        }
      } catch {
        window.sessionStorage.removeItem(k)
      }
    }
  } catch { /* sessionStorage tak tersedia (privacy mode) */ }
}

/**
 * Simpan output sebuah fitur. Menimpa output sebelumnya untuk fitur yang sama.
 */
export function saveResult<T>(key: ResultKey, data: T): void {
  const entry: Stored<T> = { data, savedAt: Date.now() }
  memory.set(key, entry)
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(entry))
  } catch { /* quota penuh / serialisasi gagal — cache memori tetap dipakai */ }
}

/**
 * Ambil output terakhir sebuah fitur. null kalau belum ada / sudah expire.
 */
export function loadResult<T>(key: ResultKey): T | null {
  const entry = memory.get(key) as Stored<T> | undefined
  if (!entry) return null
  if (!isFresh(entry)) {
    clearResult(key)
    return null
  }
  return entry.data
}

/**
 * Hapus output sebuah fitur (mis. saat memulai scraping baru di fitur itu).
 */
export function clearResult(key: ResultKey): void {
  memory.delete(key)
  if (typeof window === "undefined") return
  try { window.sessionStorage.removeItem(storageKey(key)) } catch { /* ignore */ }
}
