---
# The single source of truth for everything that would otherwise be hardcoded.
# PLAN.md §5.7 — no .astro file may contain the brand name, a phone number, ₹,
# a hex colour or a menu label. If it could ever change, it lives here.
brand:
  name: Jadauco
  tagline: Imitation jewellery for every occasion
  logo: ./logo.svg
  logoAlt: Jadauco
contact:
  # The WhatsApp Business line. Both fields are the same number today; they are separate
  # because the number a customer calls and the number that receives enquiries do not have
  # to be, and splitting them later should not mean touching any code.
  whatsapp: "+919871877991"
  phone: "+919871877991"
  email: jadauco.jewels@gmail.com
  city: Gurgaon
  state: Haryana
  country: IN
currency:
  code: INR
  symbol: "₹"
  locale: en-IN
enquiry:
  template: "Hi Jadauco, I'm interested in {title} ({sku}) — {url}"
labels:
  enquire: Enquire on WhatsApp
  enquireShort: Enquire
  call: Call us
  priceOnEnquiry: Price on enquiry
  soldOut: Sold out
  soldOutBody: This one has gone. Message us and we'll tell you if it's coming back.
  askRestock: Ask about restock
  inStock: In stock · dispatched in 2–5 days
  save: "Save {amount}"
  featured: Featured
  newFlag: New
  relatedTitle: You may also like
  emptyCategory: New pieces coming soon.
  archived: No longer available
  archivedBody: We've stopped making this design, but the page stays up so old links still work.
  specifications: Specification
  newArrivals: New arrivals
  allJewellery: All jewellery
  messagePreview: The message that opens
  hours: Monday to Saturday, 10am to 8pm IST.
# Hand-picked, and hand-written hrefs — the one category list that does not go through
# products.ts `categories()`. Hiding a category does not remove it from here, so a `hidden: true`
# in src/content/categories/ means checking this list too.
nav:
  - { label: Necklaces, href: /collections/necklaces/ }
  - { label: Pendants, href: /collections/pendants/ }
  - { label: Earrings, href: /collections/earrings/ }
  - { label: Bangles, href: /collections/bangles/ }
  - { label: All jewellery, href: /products/ }
  - { label: About, href: /about/ }
footerLinks:
  - { label: About us, href: /about/ }
  - { label: Care guide, href: /care-guide/ }
  - { label: Shipping & returns, href: /shipping-returns/ }
  - { label: Terms & conditions, href: /terms/ }
  - { label: Privacy policy, href: /privacy/ }
  - { label: Disclaimer, href: /disclaimer/ }
trust:
  - { title: Damage replaced, detail: Reported within 24 hours }
  - { title: Ships across India, detail: "3–7 days, shipping extra" }
  # Quoted: inside a YAML flow mapping an unquoted comma ends the value, so this
  # silently became "Under ₹3" until it was quoted.
  - { title: Cash on delivery, detail: "Under ₹3,000" }
legal:
  - "**Everything here is imitation jewellery.** Pieces are brass with a plated gold or oxidised finish — not solid gold, not silver, and not set with precious or semi-precious stones. Stones are glass, resin or imitation kundan."
  - "Sold as seen, with no guarantee or warranty of any kind beyond the replacement for damage in transit, reported within 24 hours of delivery, set out in [Shipping & returns](/shipping-returns/). Prices exclude shipping, which is quoted separately. We do not accept returns for a change of mind. Plated finishes wear with use; how long yours lasts depends on how it is worn and stored, so we make no promise about it. Colour and size vary a little between screens and between batches. Prices and availability change without notice, and nothing on this site is an offer to sell — an order exists only once we have confirmed it in writing over WhatsApp."
  - "Product names describe a style, not an origin or a maker. Full details in our [Terms & conditions](/terms/), [Disclaimer](/disclaimer/) and [Privacy policy](/privacy/)."
social:
  instagram: https://instagram.com/jadauco_jewels
seo:
  siteName: Jadauco
  defaultTitle: Jadauco — Imitation Jewellery Online
  titleTemplate: "%s | Jadauco"
  defaultDescription: Brass jewellery in a gold or oxidised finish. Secure fittings, the price under every piece, and ordering by code on WhatsApp. Ships across India.
  twitterHandle: ""
  googleSiteVerification: ""
  analyticsId: ""
---
