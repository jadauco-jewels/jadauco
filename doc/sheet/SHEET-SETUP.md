# Setting up the catalogue sheet

One-time setup, about fifteen minutes. Do this on the **Google account the shop keeps
long-term** — not a personal account that could be lost (`PLAN.md` open item 9).

---

## 1. Import the two tabs

The sheet has exactly two tabs:

| Tab | What it is |
|---|---|
| **catalogue** | Every product, one per row. The only tab the website reads. |
| **instructions** | What every column means, who fills it in, and one example each. Notes only — the website never reads it. |

1. Go to [sheets.new](https://sheets.new) and name the file **Jadauco catalogue**.
2. **File → Import → Upload**, choose `catalogue-tab-TEMPLATE.csv`.
   Import location: **Replace current sheet**. Separator: **Detect automatically**.
   Leave *Convert text to numbers, dates and formulas* **ticked** — `Category (auto)` is a
   formula, and it arrives as dead text without it.
3. Rename that tab at the bottom to **`catalogue`**.
4. **File → Import → Upload** again, choose `instructions-tab.csv`, this time with import
   location **Insert new sheet**. Rename the new tab to **`instructions`**.

> **Tab names are for you, not for the sync.** The website finds the catalogue by the tab's
> **gid** — the number in the URL when that tab is open — which is recorded in
> `catalogue.config.json`. Renaming a tab is always safe; *deleting and re-creating* one is not,
> because the gid changes and the sync would be pointed at a tab that no longer exists. If you
> ever do that, send the new URL over.

The three sample rows show the shape of the data. Delete them once your own products are in, or
set their `Status` to `draft` and keep them as a reference.

**Every cell in those rows is filled in, so you can see what each column expects — that is not
the same as saying every cell needs filling.** Most products need nothing in the last four
columns, and blanks are meaningful: an empty `List Price` means no struck-through "was" price, an
empty `Sequence` means "no opinion about the order", an empty `SEO Description` means the website
writes one for you. The table further down says which is which.

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
| `Hero` | Same — tick box. |
| `Earrings Included` | Same — tick box. |
| `Sequence` | **Format → Number → Number**, 0 decimal places. Whole numbers from 1, or blank. |
| `Publish Date` | Select the column → **Data → Data validation → Date**, *is a valid date*. Then **Format → Number → Date**. |
| `Selling Price`, `List Price` | **Format → Number → Number**, 0 decimal places. Do **not** use the currency format — the sync wants a plain number, and the ₹ is added by the website. |

Then protect the header row so it cannot be renamed by accident:
select row 1 → right-click → **Protect range** → *Only you can edit*.

The sync reads columns **by their header text, not their position**, so you can reorder columns
or insert new ones freely. Two things you must not do: rename a header — that makes the column
invisible to the sync — or move the headers off **row 1**, which is where the sync expects to
find them. That is why the groups below are colour and outlines rather than a banner row.

## 4. Make the groups visible

Twenty-four columns in a flat row is what makes a sheet feel unusable. The columns are already
in group order; this is how you make the sheet show it.

| Cols | Group | Header fill |
|---|---|---|
| A–D | **The piece** | dark |
| E–G | **Price & stock** | green |
| H | **Photos** | blue |
| I–N | **Specification** | grey |
| O–R | **Shop front** | amber |
| S–T | **Dates & words** | blue |
| U–X | **Overrides** | pale grey |

1. **Freeze what you navigate by.** *View → Freeze → Up to column D*, and *Up to row 1*. The
   code, the category, the name and the status stay on screen however far right you scroll.
2. **Collapse the overrides.** Select columns **U:X** → right-click → **Group columns**. They
   are empty on almost every product, and behind a `▸` the sheet reads as twenty columns
   instead of twenty-four. Grouped and hidden columns are still exported to the sync, so this
   changes nothing about what gets published — but prove it with one `npm run validate` before
   you trust it.
3. **Grey out `Category (auto)`.** It holds a formula, not typing. Give it a grey fill so nobody
   overwrites it. The sync ignores any header it does not recognise, so it costs nothing.
4. **Wrap the long ones.** Select `Description` → **Format → Wrapping → Clip**. Clip, not wrap:
   a wrapped 40-word description makes every row four lines tall.

### Checking before you publish

**Jadauco menu → Check the catalogue.**

It runs the same rules the publish runs, then turns every cell at fault red and puts the reason
in the cell's note — hover to read it. **Jadauco → Clear the check marks** takes the red off
again. A clean check means the publish will go through; that is the whole point of it.

It is Apps Script rather than a formula in a column for one reason: a formula cannot see the
Drive folder, and the three mistakes that actually cost a publish all live there —

- a filename in `Images` that is not in Drive (it names the file that *is* there, so a wrong
  capital or a `.PNG` for a `.jpg` is obvious)
- the same photo used by two different products
- a photo sitting in Drive that no row uses

The script runs as you, so it can list the folder and check all three. If Drive cannot be read it
says so and checks everything else, rather than passing photos it never looked at.

### Installing it

Everything is in **one file**, `tools/apps-script/Code.gs` — the checking and the publishing
both. There is no second file to add.

1. Open the sheet → **Extensions → Apps Script**
2. If the project already has more than one `.gs` file, **delete the extras**: click the ⋮ beside
   each and choose *Delete file*. Apps Script puts every file in one shared namespace, so a
   leftover copy silently redefines whatever it also contains.
3. Select all in `Code.gs` and paste the whole of `tools/apps-script/Code.gs` over it
4. **Save**, then pick `setUp` in the function dropdown and press **Run**
5. Approve the permissions. It now asks for **Drive** as well, which is new — that is the folder
   listing that lets it check photo filenames. You will be asked again even if you approved before
6. Reload the spreadsheet

`Script function not found: checkCatalogue` means step 3 did not land — the menu is from an older
paste and the function it calls is not in the project.

The rules and `scripts/sheet/validation.test.mjs` are checked against each other: the test loads
that exact file and asserts it agrees with the real validator on every rule. A check that told
you a row was fine and then watched the publish fail would be worse than no check.

### What `Category (auto)` does

It answers "what will `JD-BG-001` become?" without you having to remember that `BG` means
bangles, and shows **⚠ unknown code** the moment you mistype one — a mistake that otherwise only
surfaces as a failed sync ten minutes later.

The formula ships in the template. To paste it into a new row by hand:

```
=IF(A2="","",SWITCH(MID(A2,4,2),"NK","Necklaces","ER","Earrings","BG","Bangles",
  "RG","Rings","PD","Pendants","⚠ unknown code"))
```

## 5. Flag blank required cells

**Jadauco → Check the catalogue** already names every missing required cell. This is belt and
braces: it shows an empty required cell the moment you leave it, without running anything.

**Format → Conditional formatting**, rule *Cell is empty*, fill red. Apply it to
`A2:A1000,C2:D1000,H2:H1000,S2:T1000` — the six columns the sync will not accept a row without:

`Product Code` · `Product Name` · `Status` · `Images` · `Publish Date` · `Description`

A red cell means the sync will refuse that row. (A `draft` row is exempt from the photo and
description rules, so red on a draft is a reminder, not a blocker.)

## 6. Note the IDs

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
| **Product Code** | `JD-NK-001`. The two letters in the middle decide the category — `NK` necklaces, `ER` earrings, `BG` bangles, `RG` rings, `PD` pendants. Must be unique; no two products share a code. The `Category (auto)` column next to it tells you which one you picked. |
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
| **Featured** | Tick to put it in the **strip further down the homepage**, *On the tray this week*. Tick as many as you like; the six most recent are shown. |
| **Hero** | Tick the **one** piece that stands in the ring at the very top of the homepage. Tick one only — if two are ticked the sync warns you and uses the higher row. Leave every box unticked and the newest featured piece stands in, so the top of the page is never empty. The photo used is that product's **first** photo, so reorder its `Images` column if you want a different one up there. |
| **Sequence** | The running order. Number the pieces you want first — `1`, `2`, `3` — and leave the rest blank. See below. |
| **Tags** | Comma separated. Drives *You may also like* and the filter buttons. |
| **Category override** | Leave blank. `Category (auto)` is the one that tells you where a piece is going; this one **forces** it somewhere else. See below for the one case that needs it. |
| **Slug override** | Leave blank, and only ever useful **before** a product's first sync. See below. |
| **SEO Title / SEO Description** | Leave blank. The website writes both. Fill only for a piece you are deliberately trying to rank. |

### How `Sequence` orders a page

Without it, every grid is newest-first. `Sequence` lets you pin what goes at the top.

**You do not have to number everything.** A blank Sequence means "no opinion", and those pieces
fall in behind the numbered ones, still newest-first. So numbering three earrings `1`, `2`, `3`
puts exactly those three at the front of the earrings page and leaves the rest alone.

The number is **not** per-category, and that turns out to be the useful behaviour:

| Page | What you see |
|---|---|
| `/collections/earrings/` | only earrings, so your `1, 2, 3` reads exactly as written |
| `/collections/necklaces/` | only necklaces, likewise |
| `/products/` (everything) | the numbers interleave, floating each category's best piece up |

So you can number within a category without thinking about the rest of the catalogue, and the
all-jewellery page still sorts sensibly. Ties fall back to newest-first.

One exception, deliberately: **New arrivals ignores Sequence.** It is a claim about dates, so a
hand-set order is not allowed to push a six-month-old piece into it.

### Why there are two Category columns

They do opposite jobs, which is why one is named *override*:

| | |
|---|---|
| `Category (auto)`, column B | A formula. **Shows** what the product code already decided. Grey, read-only, never sent to the website. |
| `Category override`, in the collapsed group | **Forces** a different category. Empty on every product, normally forever. |

The override exists for one situation. Category comes from the product code, and the code is the
product's permanent identity — so if `JD-NK-005` is already published and turns out to be a
bangle set, you **cannot simply correct the code**: a new code reads as a brand new product and
the old page, with whatever Google ranking it had earned, is gone. The override moves it without
touching its identity. Break glass; not a routine column.

### What `Slug override` does

A product's web address is made from its **name**, lowercased with hyphens instead of spaces:
`Kundan Bridal Choker Set` becomes `/products/kundan-bridal-choker-set/`. `Slug override`
replaces that with an address you choose.

**You almost never need it.** Fill it only when you want the address to say something the name
does not — a shorter phrase, or a word customers search for that the name does not contain.
Leave it empty and the name is used, which is right for most products. An override is still
tidied up before use, so capitals and spaces in the cell do not reach the address.

Either way, the address follows the sheet. Rename a product and its page moves; the old address
redirects to the new one automatically, so a link you have already sent someone on WhatsApp or
Instagram keeps working. Every move is listed in the run summary, so you can see it happened.

> Two products cannot share an address. If two names, or two overrides, would produce the same
> one, the publish stops and names both rows.

### What the SEO columns actually change

| Column | Blank | Filled |
|---|---|---|
| **SEO Title** | The browser tab and Google's blue link read `Temple Lakshmi Jhumkas \| Jadauco` | You write the phrase people search for: `Temple Jhumkas Under ₹5000 \| Jadauco` |
| **SEO Description** | The first ~158 characters of your Description, cut at the end of a sentence | You write the grey sentence under the blue link yourself |

The blank behaviour is good enough for almost everything, which is why the default is to leave
them alone. Fill them for the two or three pieces you are actively trying to rank, not as a
routine part of adding a product.

### Featured and Hero are not the same tick

Two different places on the homepage, so two different switches:

```
┌─────────────────────────────────────┐
│  ╭───────╮                          │
│  │ HERO  │   ← Hero        one piece│
│  ╰───────╯                          │
├─────────────────────────────────────┤
│  On the tray this week              │
│  ┌────┐ ┌────┐ ┌────┐               │
│  │    │ │    │ │    │  ← Featured   │
│  └────┘ └────┘ └────┘    up to six  │
└─────────────────────────────────────┘
```

A piece can be both, one, or neither. Ticking `Hero` on something you have not also ticked
`Featured` is fine — it still shows at the top.

---

## The optional `images` tab

Only needed when you want to write your own alt text — the description of a photo that Google
Images reads and a screen reader speaks aloud. Without this tab the sync writes alt text for
you, and the run summary tells you which products got the automatic version.

Hand-written is better, and worth doing for the pieces you most want found. To start:
**Import → Insert new sheet** with `images-template.csv`, and name the tab `images`.

You do not need it on day one.

---

## Reorganising a sheet you already have

You do not need to re-import the template to get the layout above, and you should not — it
would replace your products. Because the sync finds columns by **header text**, you can
rearrange a live sheet safely:

1. Drag whole columns into the order in the template's header row. Select the column letter,
   then drag — never cut and paste cells, which leaves the header behind.
2. Insert `Category (auto)` at column B and paste its formula into row 2, then fill down.
3. Add `Hero` and `Sequence`. Tick exactly one Hero.
4. Apply the freeze, grouping, colours and conditional formatting from §4 and §5.
5. Run `npm run validate` (see below). It reads the sheet and writes nothing. A clean run means
   the rearrangement was invisible to the sync, which is the point.

Only step 5 can tell you it worked — **Check the catalogue** cannot, because it validates the
*rows* and this is a change to the *columns*. Do it before you trust the new layout.

## Checking the sheet without publishing

```
npm run validate
```

Reads the sheet, lists the Drive folder, runs **exactly the validator the sync runs**, and stops.
No photos are downloaded, nothing is written, nothing is published. It takes a few seconds, and
it answers the question you actually have most of the time — *did I fill that row in correctly?*

It reports the same errors the sync would, plus the things you cannot see by looking at the
sheet: a photo named in a row that is not in Drive, a photo in Drive that no row uses, two rows
that would want the same web address.

Use it after any bulk edit, and always after rearranging columns.

> `npm run sync -- --dry-run` also changes nothing, but it gets there by downloading and
> re-encoding every photo first, so it takes minutes rather than seconds. Reach for it when you
> want to know what a *publish* would do; reach for `validate` when you want to know if the
> sheet is right.

## Adding a product, once set up

1. Drop the photos into the Drive folder, named `JD-NK-002-1.jpg`, `JD-NK-002-2.jpg`.
2. Add one row here, with those filenames in the `Images` column.
3. **Actions → Sync catalogue → Run workflow** in GitHub.

About four minutes later it is live. If something is wrong the sync stops, changes nothing,
emails you, and the summary says which row and what to fix.
