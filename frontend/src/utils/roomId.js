const ROOM_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * Generates an unguessable per-user private room ID (e.g. "cf-8k4m2p9x")
 * using Web Crypto randomness so strangers opening the root URL never share the same default room.
 */
export function generatePrivateRoomId(length = 8) {
  let code = "";
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      code += ROOM_ALPHABET[bytes[i] % ROOM_ALPHABET.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
    }
  }
  return `cf-${code}`;
}
