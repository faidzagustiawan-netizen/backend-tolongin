import * as crypto from 'crypto';

// Gunakan APP_SECRET dari env, jika tidak ada fallback ke default statis (Hanya untuk testing)
const SECRET_KEY = process.env.APP_SECRET
  ? crypto
      .createHash('sha256')
      .update(String(process.env.APP_SECRET))
      .digest('base64')
      .substring(0, 32)
  : 'vOVH6sdmpNWjRRIqCc7rdxs01lwHzfr3'; // 32 bytes fallback
const ALGORITHM = 'aes-256-gcm';

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
      Buffer.from(SECRET_KEY),
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

      const decipher = crypto.createDecipheriv(
        ALGORITHM,
        Buffer.from(SECRET_KEY),
        iv,
      );
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error(
        'Dekripsi gagal. Data mungkin rusak atau kunci berubah.',
        error,
      );
      throw new Error('Gagal membaca data privasi terenkripsi');
    }
  }
}
