import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const MIN_SECRET_LENGTH = 32;

/**
 * Kunci diturunkan dari APP_SECRET dan tidak punya nilai cadangan.
 *
 * Sebelumnya ada fallback konstanta yang tertulis di source code. Karena kunci
 * ini melindungi foto KTP dan selfie kandidat, kunci yang ikut ter-commit sama
 * saja dengan tidak dienkripsi: siapa pun yang punya salinan repo dan akses
 * basis data bisa membaca seluruh dokumen identitas. Lebih baik aplikasi gagal
 * start daripada diam-diam menyimpan data pribadi dengan kunci publik.
 */
function deriveKey(): Buffer {
  const secret = process.env.APP_SECRET;

  if (!secret || secret.trim().length < MIN_SECRET_LENGTH) {
    throw new Error(
      `APP_SECRET wajib diisi minimal ${MIN_SECRET_LENGTH} karakter. ` +
        'Kunci enkripsi data identitas tidak boleh memakai nilai bawaan.',
    );
  }

  // Turunan ini HARUS tetap sama persis dengan versi sebelumnya
  // (sha256 -> base64 -> 32 karakter pertama). Mengubah rumusnya membuat
  // seluruh encryptedKtpData dan encryptedPrivateFace yang sudah tersimpan
  // tidak bisa didekripsi lagi.
  const keyString = crypto
    .createHash('sha256')
    .update(String(secret))
    .digest('base64')
    .substring(0, 32);

  return Buffer.from(keyString);
}

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (!cachedKey) {
    cachedKey = deriveKey();
  }
  return cachedKey;
}

/**
 * Kunci bawaan lama yang dulu dipakai ketika APP_SECRET kosong. Nilainya
 * tertulis di riwayat repo sehingga TIDAK aman, dan hanya dipertahankan untuk
 * MEMBACA baris lama supaya bisa dienkripsi ulang dengan kunci yang benar.
 *
 * Aktifkan sementara dengan ALLOW_LEGACY_DECRYPT=true, jalankan skrip
 * re-enkripsi, lalu matikan kembali.
 */
const LEGACY_FALLBACK_KEY = 'vOVH6sdmpNWjRRIqCc7rdxs01lwHzfr3';

function isLegacyDecryptEnabled(): boolean {
  return process.env.ALLOW_LEGACY_DECRYPT === 'true';
}

function decryptWith(
  key: Buffer,
  iv: Buffer,
  authTag: Buffer,
  encryptedText: string,
): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export class EncryptionUtil {
  /**
   * Mengenkripsi data string (seperti base64 image) menggunakan AES-256-GCM
   * @param text String yang akan dienkripsi
   * @returns String terenkripsi berformat: IV:AUTH_TAG:ENCRYPTED_DATA
   */
  static encrypt(text: string): string {
    if (!text) return text;

    // 12 bytes IV is standard for GCM
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      ALGORITHM,
      getKey(),
      iv,
    );

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Mendekripsi data yang sebelumnya dienkripsi menggunakan encrypt()
   * @param encryptedData String terenkripsi berformat: IV:AUTH_TAG:ENCRYPTED_DATA
   * @returns String asli
   */
  static decrypt(encryptedData: string): string {
    if (!encryptedData) return encryptedData;

    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Format data terenkripsi tidak valid');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encryptedText = parts[2];

      try {
        return decryptWith(getKey(), iv, authTag, encryptedText);
      } catch (primaryError) {
        // GCM menolak kunci yang salah lewat kegagalan auth tag, jadi kegagalan
        // di atas kemungkinan besar berarti baris ini ditulis dengan kunci
        // bawaan lama sebelum APP_SECRET diwajibkan.
        if (!isLegacyDecryptEnabled()) {
          throw primaryError;
        }

        console.warn(
          'Dekripsi dengan APP_SECRET gagal, mencoba kunci bawaan lama. ' +
            'Baris ini perlu dienkripsi ulang.',
        );
        return decryptWith(
          Buffer.from(LEGACY_FALLBACK_KEY),
          iv,
          authTag,
          encryptedText,
        );
      }
    } catch (error) {
      console.error(
        'Dekripsi gagal. Data mungkin rusak atau kunci berubah.',
        error,
      );
      throw new Error('Gagal membaca data privasi terenkripsi');
    }
  }
}
