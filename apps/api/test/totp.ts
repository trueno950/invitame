/**
 * Decodes an RFC 4648 base32 string to UTF-8. That is only correct for an ASCII secret: the TOTP
 * secret Better Auth generates is an ASCII string, and its base32 form is what the `otpauth://` URI
 * carries in its `secret` parameter.
 */
export function decodeBase32Ascii(input: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of input.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes).toString("utf8");
}
