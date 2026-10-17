/** Código de invitación a un viaje compartido (puro, para testearlo). */

// Sin 0/O ni 1/I: se dicta en voz alta.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const CODE_LENGTH = 6

export function newInviteCode(random: () => number = Math.random): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]).join("")
}
