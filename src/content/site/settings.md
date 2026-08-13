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
  # PLACEHOLDERS — PLAN.md open item 2. Swap before go-live.
  whatsapp: "+919000000000"
  phone: "+919000000000"
  email: hello@jadauco.com
  city: Jaipur
  state: Rajasthan
  country: IN
currency:
  code: INR
  symbol: "₹"
  locale: en-IN
enquiry:
  template: "Hi Jadauco, I'm interested in {title} ({sku}) — {url}"
labels:
  enquire: Enquire on WhatsApp
  call: Call us
  priceOnEnquiry: Price on enquiry
  soldOut: Sold out
  discount: "{percent}% off"
  featured: Featured
  relatedTitle: You may also like
  emptyCategory: New pieces coming soon.
  archived: This piece is no longer available
  specifications: Specifications
  newArrivals: New arrivals
nav:
  - { label: Home, href: / }
  - { label: All Jewellery, href: /products/ }
  - { label: About, href: /about/ }
social:
  instagram: https://instagram.com/jadauco
seo:
  siteName: Jadauco
  defaultTitle: Jadauco — Imitation Jewellery Online
  titleTemplate: "%s | Jadauco"
  defaultDescription: Handpicked imitation jewellery — kundan bridal sets, temple jhumkas and everyday pieces, shipped across India.
  twitterHandle: ""
  googleSiteVerification: ""
  analyticsId: ""
---
