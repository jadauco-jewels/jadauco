# Jadauco — brand kit

Imitation jewellery brand. Everything here comes from one mark, three typefaces
and six colours. Drop this folder into your project root.

## Contents

    brand.css                 CSS variables + base classes (import first)
    head-snippet.html         font links, favicon, stylesheet — paste into <head>
    Logo.jsx                  React logo components (mark + lockup)
    logo/*.svg                vector lockups, use these on the web
    png/*.png                 high-res raster, for places that can't take SVG
    GUIDELINES.md             usage rules, voice, photography

## Logo files

    jadauco-mark.svg              mark only, ink ring + gold stone
    jadauco-mark-reversed.svg     mark on ink ground
    jadauco-mark-gold.svg         one colour, ink on gold
    jadauco-primary-stacked.svg   primary lockup, mark over wordmark
    jadauco-horizontal.svg        header lockup
    jadauco-favicon.svg           64px, stone retained
    jadauco-favicon-small.svg     24px, plain ring (stone dropped)

## Colour

    ink     #211A12   text, headers, primary buttons
    brass   #8A6A2C   small caps labels, prices, links
    gold    #C6A45C   accent fills and rules — one element per screen
    sand    #F5F1E9   section backgrounds
    cream   #FFFDF8   page background
    bone    #F0E6D2   text on ink

Gold is an accent, not a background. Never set body copy in gold.

## Type

    Alegreya         headings and the wordmark
    Karla            body copy and UI
    IBM Plex Mono    labels, prices, buttons

All three are free on Google Fonts. See head-snippet.html.

## Tagline

Primary:      Real enough to wear every day.
Price-led:    Heirloom looks, everyday prices.
Homepage:     Jewellery you can actually wear out.
Short:        Dressed, not dented.

Pick one and use it consistently. The wordmark descriptor stays
"Imitation jewellery" regardless.

## Rules

- Clear space around the logo equals one stone-width on all sides.
- Minimum mark size 24px. Below that use jadauco-favicon-small.svg.
- Never stretch, recolour outside the palette, or add a drop shadow.
- Never imply the pieces are solid gold or stone-set. Never use "hallmark".

## Placeholders

.jd-photo-placeholder marks where real product photography goes. Replace every
instance before launch — cream or sand background, soft daylight, one piece per
frame, plus one on-body shot per product so scale is obvious.
