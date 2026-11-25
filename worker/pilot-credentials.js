const encoder = new TextEncoder();
export const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
export const randomHex = length => hex(crypto.getRandomValues(new Uint8Array(length)));
export const hash = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
export const loginName = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
export const validLogin = value => /^[a-z0-9][a-z0-9_.-]{2,23}$/.test(value);
export const validPassword = value => typeof value === 'string' && value.length >= 6 && value.length <= 128;

async function passwordDigest(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({
    name:'PBKDF2', hash:'SHA-256', salt:encoder.encode(salt), iterations:100000
  }, key, 256)));
}

export async function createCredentials(password) {
  const salt = randomHex(16);
  return {salt, digest:await passwordDigest(password, salt)};
}

export async function matchesPassword(password, salt, expected) {
  const actual = await passwordDigest(password, salt ?? '00000000000000000000000000000000');
  if (!expected) return false;
  let difference = 0;
  for (let index=0;index<actual.length;index++) difference |= actual.charCodeAt(index)^expected.charCodeAt(index);
  return difference===0;
}
