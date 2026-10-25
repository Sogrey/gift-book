/**
 * 加密核心 —— 数据金融级保护
 *
 * 方案（较原项目 bare-SHA256 升级）：
 * - 管理密码经 PBKDF2-SHA256（210,000 迭代，16 字节随机盐）派生 256-bit 密钥
 * - 全量数据以 AES-256-CBC 加密落库（随机 IV）
 * - 事件内不存储任何密码哈希；用派生密钥加密固定口令作为 verifier，
 *   解密成功即证明密码正确
 * - 派生密钥仅驻留内存 + sessionStorage（关闭浏览器即清空），不落磁盘
 */
import CryptoJS from 'crypto-js'

const PBKDF2_ITERATIONS = 210_000
const KEY_SIZE = 256 / 32 // words
const VERIFIER_PLAINTEXT = 'gift-book-vue::verifier::v1'

export interface DerivedKey {
  key: CryptoJS.lib.WordArray
  saltHex: string
}

function toHex(w: CryptoJS.lib.WordArray): string {
  return w.toString(CryptoJS.enc.Hex)
}

/** 生成随机盐 */
export function randomSalt(): string {
  return toHex(CryptoJS.lib.WordArray.random(16))
}

/** 由密码 + 盐派生 256-bit AES 密钥（PBKDF2-SHA256） */
export function deriveKey(password: string, saltHex: string): DerivedKey {
  const salt = CryptoJS.enc.Hex.parse(saltHex)
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: KEY_SIZE,
    iterations: PBKDF2_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  })
  return { key, saltHex }
}

/** 生成 verifier：用派生密钥加密固定口令的密文 */
export function makeVerifier(dk: DerivedKey): string {
  const iv = CryptoJS.lib.WordArray.random(16)
  const cipher = CryptoJS.AES.encrypt(VERIFIER_PLAINTEXT, dk.key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  })
  // salt|iv|cipher 拼接（salt 供备份迁移，此处冗余但保持 payload 格式统一）
  return `${dk.saltHex}|${toHex(iv)}|${cipher.ciphertext.toString(CryptoJS.enc.Hex)}`
}

/** 校验密码：尝试解密 verifier */
export function verifyPassword(dk: DerivedKey, verifier: string): boolean {
  try {
    const plain = decryptWithKey(dk.key, verifier)
    return plain === VERIFIER_PLAINTEXT
  } catch {
    return false
  }
}

/** AES-256-CBC 加密任意字符串 → `salt|iv|cipher`（hex） */
export function encryptWithKey(plain: string, key: CryptoJS.lib.WordArray, saltHex: string): string {
  const iv = CryptoJS.lib.WordArray.random(16)
  const cipher = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(plain), key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  })
  return `${saltHex}|${toHex(iv)}|${cipher.ciphertext.toString(CryptoJS.enc.Hex)}`
}

/** 解密 `salt|iv|cipher`，失败抛错（密码错误 / 数据损坏） */
export function decryptWithKey(key: CryptoJS.lib.WordArray, payload: string): string {
  const parts = payload.split('|')
  if (parts.length !== 3) throw new Error('E_PAYLOAD_FORMAT')
  const iv = CryptoJS.enc.Hex.parse(parts[1])
  const cipher = CryptoJS.lib.CipherParams.create({
    ciphertext: CryptoJS.enc.Hex.parse(parts[2]),
  })
  const plain = CryptoJS.AES.decrypt(cipher, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  })
  const text = plain.toString(CryptoJS.enc.Utf8)
  if (!text) throw new Error('E_DECRYPT_FAILED')
  return text
}

/** WordArray 序列化（sessionStorage 存密钥用，仅本会话） */
export function keyToHex(key: CryptoJS.lib.WordArray): string {
  return toHex(key)
}
export function keyFromHex(hex: string): CryptoJS.lib.WordArray {
  return CryptoJS.enc.Hex.parse(hex)
}
