// Shuffled base-50 alphabet: short, URL-safe, unambiguous slugs.
const ALPHABET = 'Rbz6ncxHaNQvp2B57tgAPkw8fKT9SEeGu3UqFm4hWsDXCVrdMZ';
const RADIX = ALPHABET.length;

export const SLUG_PATTERN = /^[A-Za-z0-9]+$/;

export function encodeSlug(counter) {
  if (!Number.isInteger(counter) || counter < 1) {
    throw new Error('Slug counter must be a positive integer');
  }

  let n = counter;
  let slug = '';
  do {
    const r = n % RADIX;
    slug = ALPHABET[r] + slug;
    n = (n - r) / RADIX;
  } while (n !== 0);

  return slug;
}
