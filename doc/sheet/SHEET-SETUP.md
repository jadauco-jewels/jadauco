# Setting up the catalogue sheet

One-time setup, about fifteen minutes. Do this on the **Google account the shop keeps
long-term** — not a personal account that could be lost (`PLAN.md` open item 9).

---

## 1. Import the template

1. Go to [sheets.new](https://sheets.new) and name the file **Jadauco catalogue**.
2. **File → Import → Upload**, choose `products-template.csv`.
3. Import location: **Replace current sheet**. Separator: **Detect automatically**.
   Leave *Convert text to numbers, dates and formulas* **ticked**.
4. Rename the tab at the bottom from `products-template` to **`products`** — lowercase, exactly.

The three sample rows are there to show the shape of the data. Delete them once your own
products are in, or set their `Status` to `draft` and keep them as a reference.

## 2. Make it publicly readable

**Share → General access → Anyone with the link → Viewer.**

The sync reads the sheet without a password, so it has to be link-readable. This is the
trade-off recorded in `PLAN.md` §12.4: **no cost prices, no supplier names, no customer data
in this sheet, ever.** Only what is about to be published on the website anyway.

## 3. Turn on data validation

This is what stops most mistakes before the sync ever sees them.

| Column | Set up |
|---|---|
| `Status` | Select the column → **Data → Data validation → Dropdown**, values `live`, `draft`, `archived`. Tick *Reject the input*. |
| `In Stock` | Select the column → **Data → Data validation → Tick box**. |
| `Featured` | Same — tick box. |
| `Earrings Included` | Same — tick box. |
| `Publish Date` | Select the column → **Data → Data validation → Date**, *is a valid date*. Then **Format → Number → Date**. |
| `Selling Price`, `List Price` | **Format → Number → Number**, 0 decimal places. Do **not** use the currency format — the sync wants a plain number, and the ₹ is added by the website. |

Then protect the header row so it cannot be renamed by accident:
select row 1 → right-click → **Protect range** → *Only you can edit*.

The sync reads columns **by their header text, not their position**, so you can reorder columns
or insert new ones freely. What you must not do is rename a header — that makes the column
invisible to the sync.

## 4. Flag blank required cells

**Format → Conditional formatting**, apply to `A2:D1000`, rule *Cell is empty*, fill red.
The five required columns are `Product Code`, `Product Name`, `Images`, `Description`,
and `Publish Date` — a red cell means the sync will refuse the row.

## 5. Note the IDs

The sheet URL looks like:

```
https://docs.google.com/spreadsheets/d/1AbC...XyZ/edit#gid=0
                                       └── sheetId ──┘      └ gid
```

Send both to Vikash — they go into `catalogue.config.json`, which is committed to git
(neither is secret; the sheet is public by design).

---

## The columns, in plain language

### Filled in for every product

| Column | What goes in it |
|---|---|
| **Product Code** | `JD-NK-001`. The two letters in the middle decide the category: `NK` necklaces, `ER` earrings, `BG` bangles, `RG` rings. Must be unique — no two products share a code. |
| **Product Name** | What a customer would call it. This becomes the page heading and the web address, so write it properly: *Kundan Bridal Choker Set*, not *choker 3*. |
| **Images** | The photo filenames from the Drive folder, separated by commas, **in the order they should appear**. The first one is the main photo shown in the grid. They must match Drive exactly, including `.jpg` and capital letters. |
| **Description** | At least 40 words. This is the single biggest thing that decides whether the page shows up on Google, so write about the piece — the stones, the occasion, how it wears — not just "beautiful necklace". |
| **Selling Price** | The price a customer pays, as a plain number. Leave blank and the page says *Price on enquiry*. |
| **List Price** | The "was" price, shown struck through. Leave blank for no strike-through. Must be higher than the selling price. The discount percentage is worked out by the website — there is no discount column and there should not be one. |
| **In Stock** | Untick and the page stays up but shows *Sold out* and hides the WhatsApp button. |
| **Status** | `live` on the site · `draft` invisible, still being worked on · `archived` discontinued, page kept alive for its Google ranking. |
| **Publish Date** | The date it went on sale. Used for *New arrivals*. |

### Specifications — fill what applies, leave the rest blank

`Base Metal` · `Finish` · `Stones` · `Set Includes` · `Earrings Included` · `Weight`

Each becomes one line in the specification table on the product page.

### Rarely touched

| Column | When to use it |
|---|---|
| **Featured** | Tick to put it on the homepage. |
| **Tags** | Comma separated. Drives *You may also like* and the filter buttons. |
| **Category** | Leave blank. Only fill it if a piece belongs somewhere other than what its code says. |
| **Slug** | Leave blank. The web address is made from the product name automatically, then **frozen** — renaming the product later changes the heading but never the address, which is what protects its Google ranking. |
| **SEO Title / SEO Description** | Leave blank. The website writes these. Fill only for a piece you are deliberately trying to rank. |

---

## The optional `images` tab

Only needed when you want to write your own alt text — the description of a photo that Google
Images reads and a screen reader speaks aloud. Without this tab the sync writes alt text for
you, and the run summary tells you which products got the automatic version.

Hand-written is better, and worth doing for the pieces you most want found. To start:
**Import → Insert new sheet** with `images-template.csv`, and name the tab `images`.

You do not need it on day one.

---

## Adding a product, once set up

1. Drop the photos into the Drive folder, named `JD-NK-002-1.jpg`, `JD-NK-002-2.jpg`.
2. Add one row here, with those filenames in the `Images` column.
3. **Actions → Sync catalogue → Run workflow** in GitHub.

About four minutes later it is live. If something is wrong the sync stops, changes nothing,
emails you, and the summary says which row and what to fix.
