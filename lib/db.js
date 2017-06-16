import low from 'lowdb';


/**
 * Basic setup.
 */

const FILE = './data/db.json';

let db = low(FILE);
export default db;

// Set non standard settings field on new instalaltion
if (!("settings" in db.object))
  db.object.settings = { incrementor: 0 };

export let urls = db('urls');
export let settings = db.object.settings;


/**
 * Existence Tests.
 */

export function hasUrl(url) {
  return urls.some({ url });
}

export function hasSlug(slug) {
  return urls.some({ slug });
}


/**
 * Convert a number to a slug.
 */

function numberToSlug(num) {
  let base = numberToSlug.base;
  let radix = base.length;

  let slug = "";
  let r;

  do {
   r = num % radix;
   slug = base.charAt(r) + slug;
   num = (num - r) / radix;
  } while (num !== 0)

  return slug;
}
numberToSlug.base = "Rbz6ncxHaNQvp2B57tgAPkw8fKT9SEeGu3UqFm4hWsDXCVrdMZ";


/**
 * Generate a new slug, that did not exist previously.
 *
 * Note: db.save() is not called, as it would be by the URL manager.
 */

export function generateSlug() {
  let slug;

  do {
    slug = numberToSlug(++settings.incrementor);
  } while (hasSlug(slug))

  return slug;
}


/**
 * Save a URL.
 */

export function saveUrl(url, slug = false) {
  if (!slug) {
    if (hasUrl(url)) {
      return urls.find({ url }).slug;
    } else {
      slug = generateSlug();
    }
  }

  if (hasSlug(slug)) {
    throw new Error(`Chosen slug already exists: ${slug}`);
  }

  urls.push({ url, slug, date: Date.now(), hits: 0 });

  return slug;
}


/**
 * Get a URL.
 */

export function getUrl(slug, increment = false) {
  if (!hasSlug(slug))
    throw new Error(`No URL exists for: ${slug}`);

  let record = urls.find({ slug });

  if (increment) {
    record.hits++; // Saving is not that important here
  }

  return record.url;
}
