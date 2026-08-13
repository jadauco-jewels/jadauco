import type { Settings } from './settings';

/**
 * PLAN.md §8 — the enquiry link, built at build time from the settings template.
 *
 * The point of the substitution is that the client receives a message already
 * carrying the product name, its code and its URL, so they never have to ask
 * "which one?". That is the entire ordering system.
 */
export function enquiryLink(
  settings: Settings,
  product?: { title: string; sku: string; url?: string; price?: string },
) {
  const number = settings.contact.whatsapp.replace(/\D/g, '');

  const text = product
    ? fillTemplate(settings.enquiry.template, {
        title: product.title,
        sku: product.sku,
        url: product.url ?? '',
        price: product.price ?? '',
      })
    : `Hi ${settings.brand.name}, I'd like to see what's new.`;

  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** The same text, unencoded — shown on the product page so there are no surprises. */
export function enquiryText(
  settings: Settings,
  product: { title: string; sku: string; url?: string; price?: string },
) {
  return fillTemplate(settings.enquiry.template, {
    title: product.title,
    sku: product.sku,
    url: product.url ?? '',
    price: product.price ?? '',
  });
}

export function telLink(settings: Settings) {
  return `tel:${settings.contact.phone}`;
}

/** +919876543210 → +91 98765 43210, for a number a human has to read aloud. */
export function displayPhone(settings: Settings) {
  const digits = settings.contact.phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return settings.contact.phone;
}

function fillTemplate(template: string, values: Record<string, string>) {
  return template
    .replace(/\{(\w+)\}/g, (match, key) => (key in values ? values[key] : match))
    // A blank price or url leaves " — " hanging off the end of the sentence.
    .replace(/\s*—\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
