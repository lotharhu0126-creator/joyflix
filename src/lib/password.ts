const HASH_PREFIX = 'pbkdf2-sha256';
const ITERATIONS = 310_000;
const KEY_LENGTH = 32;

function toBase64(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function derivePasswordKey(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    passwordKey,
    KEY_LENGTH * 8
  );
  return new Uint8Array(bits);
}

export function isPasswordHash(value: string): boolean {
  return value.startsWith(`${HASH_PREFIX}$`);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePasswordKey(password, salt, ITERATIONS);
  return `${HASH_PREFIX}$${ITERATIONS}$${toBase64(salt)}$${toBase64(derived)}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [prefix, iterationsString, saltBase64, hashBase64] =
    storedHash.split('$');
  const iterations = Number(iterationsString);

  if (
    prefix !== HASH_PREFIX ||
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    !saltBase64 ||
    !hashBase64
  ) {
    return false;
  }

  try {
    const expected = fromBase64(hashBase64);
    const actual = await derivePasswordKey(
      password,
      fromBase64(saltBase64),
      iterations
    );
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}
