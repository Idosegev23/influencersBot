// Create a test password hash
import crypto from 'crypto';

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const encoder = new TextEncoder();
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  
  const hashArray = Array.from(new Uint8Array(derivedBits));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('');
  
  return `${saltHex}:${hashHex}`;
}

// Create hash for password "test123"
const password = 'test123';
const hash = await hashPassword(password);
console.log('\n=== Password Hash Generated ===');
console.log('Password:', password);
console.log('Hash:', hash);
console.log('\nRun this SQL to update:');
console.log(`UPDATE influencers SET admin_password_hash = '${hash}' WHERE username = 'danitgreenberg';`);
