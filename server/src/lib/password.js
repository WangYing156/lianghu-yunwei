/** 口令散列：scrypt（Node 内置，无需编译原生依赖），格式 scrypt$N$r$p$salt$hash */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const N = 16384
const r = 8
const p = 1
const keylen = 64

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, keylen, { N, r, p, maxmem: 64 * 1024 * 1024 }).toString('hex')
  return `scrypt$${N}$${r}$${p}$${salt}$${hash}`
}

export function verifyPassword(password, stored) {
  if (!stored) return false
  const parts = String(stored).split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, nStr, rStr, pStr, salt, hash] = parts
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(password, salt, expected.length, {
    N: Number(nStr),
    r: Number(rStr),
    p: Number(pStr),
    maxmem: 64 * 1024 * 1024,
  })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
