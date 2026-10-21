/**
 * Deprecated leftover. Job-order privateNotes E2EE was abandoned;
 * do not wire this into new writes. File kept only to recognize old TLFL_E2EE_V1 blobs.
 */
export class CryptoWeb {
  static MAGIC_HEADER = 'TLFL_E2EE_V1:';

  static async deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );
    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  static async encrypt(plaintext, password) {
    if (!plaintext || !password) return plaintext;
    
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(password, salt);
    
    const enc = new TextEncoder();
    const encryptedContent = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      enc.encode(plaintext)
    );
    
    const ciphertext = new Uint8Array(encryptedContent);
    const saltB64 = btoa(String.fromCharCode(...salt));
    const ivB64 = btoa(String.fromCharCode(...iv));
    const cipherB64 = btoa(String.fromCharCode(...ciphertext));
    
    return `${this.MAGIC_HEADER}${saltB64}:${ivB64}:${cipherB64}`;
  }

  static async decrypt(encryptedString, password) {
    if (!encryptedString || !encryptedString.startsWith(this.MAGIC_HEADER)) {
      return encryptedString; // Not encrypted or wrong format
    }
    
    if (!password) {
      throw new Error('NO_PASSWORD');
    }

    const payload = encryptedString.substring(this.MAGIC_HEADER.length);
    const parts = payload.split(':');
    if (parts.length !== 3) throw new Error('INVALID_FORMAT');
    
    const salt = Uint8Array.from(atob(parts[0]), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
    
    const key = await this.deriveKey(password, salt);
    
    try {
      const decryptedContent = await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: iv
        },
        key,
        ciphertext
      );
      
      const dec = new TextDecoder();
      return dec.decode(decryptedContent);
    } catch (e) {
      throw new Error('WRONG_PASSWORD');
    }
  }
}
