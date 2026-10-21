const crypto = require('crypto');

const ENCRYPTION_ALGO = 'aes-256-gcm';
const PBKDF2_ITERATIONS = 310000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const MAGIC_HEADER = Buffer.from('TLFL_ENC_V1:');

class CryptoEngine {
  /**
   * Derive an AES-256 key from a password asynchronously
   */
  static deriveKey(password, salt) {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, 32, 'sha512', (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });
  }

  /**
   * Encrypt a JSON string into a Buffer
   * Format: [MAGIC:12][SALT:16][IV:12][TAG:16][CIPHERTEXT]
   */
  static async encryptBlob(jsonStr, password) {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = await this.deriveKey(password, salt);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, key, iv);
    const encrypted = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([MAGIC_HEADER, salt, iv, tag, encrypted]);
  }

  /**
   * Decrypt a Buffer into a JSON string
   */
  static async decryptBlob(buffer, password) {
    if (buffer.length < MAGIC_HEADER.length + SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
      throw new Error('INVALID_DATA_LENGTH');
    }

    if (!buffer.subarray(0, MAGIC_HEADER.length).equals(MAGIC_HEADER)) {
      throw new Error('NOT_ENCRYPTED_FORMAT');
    }

    let offset = MAGIC_HEADER.length;
    
    const salt = buffer.subarray(offset, offset + SALT_LENGTH);
    offset += SALT_LENGTH;
    
    const iv = buffer.subarray(offset, offset + IV_LENGTH);
    offset += IV_LENGTH;
    
    const tag = buffer.subarray(offset, offset + TAG_LENGTH);
    offset += TAG_LENGTH;
    
    const ciphertext = buffer.subarray(offset);

    const key = await this.deriveKey(password, salt);
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
  
  static isEncryptedFormat(buffer) {
    return buffer.length >= MAGIC_HEADER.length && buffer.subarray(0, MAGIC_HEADER.length).equals(MAGIC_HEADER);
  }
}

module.exports = CryptoEngine;
