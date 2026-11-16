/**
 * The type of an uploaded image from its first bytes, never from the upload's own claim:
 * PNG or JPEG, else null. Used for garage logos and offer images.
 */
export function imageType(bytes: Buffer): 'image/png' | 'image/jpeg' | null {
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return 'image/jpeg';
  return null;
}
