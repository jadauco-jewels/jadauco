# Running the Jadauco website

Everything you need to do happens in two places you already use: a **Google Drive folder** for
the photos, and a **Google Sheet** for everything else. You never need to open GitHub, and you
never need to write any code.

> **Screenshots** — to be added alongside the first walkthrough (T-26). Each numbered step below
> is where one goes.

---

## Adding a new product

Three steps. About two minutes.

### 1. Put the photos in Drive

Open the **Jadauco product photos** folder and drag the photos in. From a phone, use the Drive
app's **+ → Upload**.

You do not need to rename them. The website renames them for you when it publishes.

What makes a good photo:
- At least 1200 × 1200 pixels — any recent phone is fine
- Plain, uncluttered background
- Good daylight, no flash
- The first photo you list is the one shown in the grid, so make it the best one

### 2. Add a row to the sheet

Open the **Jadauco catalogue** sheet and fill in one row. The columns that must be filled:

| Column | What to put |
|---|---|
| **Product Code** | `JD-NK-014`. The two letters in the middle set the category — `NK` necklaces, `ER` earrings, `BG` bangles, `RG` rings. Never reuse a code. |
| **Product Name** | What a customer would call it: *Kundan Bridal Choker Set*. |
| **Images** | The photo filenames from Drive, separated by commas, in the order you want them shown. Copy the names from Drive and paste them — do not retype them. |
| **Description** | At least 40 words about the piece. |
| **Status** | `live` to put it on the site. |
| **Publish Date** | Today's date. |

Everything else is optional. Fill in the price, the weight, the stones and the rest where you
know them; leave the rest blank.

### 3. Publish

In the sheet's menu bar, choose **Jadauco → Publish to website**.

You will see *"Publishing started."* Wait about four minutes, then check the site. That is it.

---

## Everyday changes

All of these are: edit the cell, then **Jadauco → Publish to website**.

| To do this | Change this |
|---|---|
| Change a price | `Selling Price` |
| Show a discount | Put the old price in `List Price` — the percentage is worked out for you |
| Mark something sold out | Untick `In Stock` — the page stays up, the WhatsApp button is hidden |
| Put it on the homepage | Tick `Featured` |
| Change 40 prices at once | Edit all 40, then publish once |
| Replace a photo | Upload the better photo to Drive **with the same filename**, replacing the old one |
| Add a photo | Upload it, then add its filename to that row's `Images` |
| Stop selling something | Set `Status` to `archived` |

### Two things that need care

**Never delete a row.** If you delete a row for a product that is already on the site, the sync
will stop and refuse to publish anything. This is on purpose — a deleted row would take a page
off Google that took months to rank. To stop selling something, set `Status` to `archived`
instead. The page stays up, says the piece is no longer available, and disappears from the
grids.

**Never rename a photo in Drive** once it is live. Renaming looks like deleting one photo and
adding a different one. If you do rename it, update the `Images` column to match.

---

## Working on something not ready yet

Set `Status` to `draft`.

A draft can be as incomplete as you like — no photos, no description, no price. It is not
checked, and nothing about it appears on the website. When it is ready, change `Status` to
`live` and publish.

This is the right way to work on next season's pieces without them leaking onto the site.

---

## When something goes wrong

If anything is wrong, **the sync stops and changes nothing**. The website stays exactly as it
was. You get an email, and the run summary tells you which row and what to fix.

The message always names the row number you can see in the spreadsheet, so you can go straight
to it.

### The three you are most likely to see

**1. A photo filename does not match**

```
Row 14 (JD-ER-009): Images names "img_5797.png", which is not in the Drive folder
  → The folder has "IMG_5797.PNG". Filenames must match exactly, including capital
    letters — copy it from Drive and paste it in.
```

Filenames are fussy about capital letters and about `.jpg` versus `.png`. The fix is always the
same: copy the name from Drive rather than typing it.

**2. The description is too short**

```
Row 14 (JD-ER-009): Description is 22 words; the minimum is 40
  → Write about the stones, the finish, the occasion and how it wears. Short
    descriptions are the main reason catalogue pages fail to rank.
```

This one is a real quality gate, not red tape. A page with twenty words on it will not be found
on Google, so it is worth the extra two minutes.

**3. A product has vanished from the sheet**

```
1 product has disappeared from the sheet:
  · JD-NK-014 is in the repo (src/content/products/kundan-bridal-choker-set/) but
    not in the sheet.
```

A row was deleted, or sorted somewhere unexpected. Put the row back. If you genuinely want the
product gone from the site, put the row back and set its `Status` to `archived`.

### Checking before you publish

If you want to be sure before committing to anything, ask Vikash to run a **dry run** — it
checks every row and reports every problem without touching the website.

---

## Questions people ask

**Can I edit the website text directly?**
The product pages come from the sheet, so edit the sheet. The About, Care Guide and Shipping
pages, the category descriptions and the menu are written in the code and need Vikash.

**Can I undo a mistake?**
Yes. Every publish is recorded, and any change can be reverted. Ask Vikash.

**What if I publish twice by mistake?**
Nothing happens. Publishing when nothing has changed does nothing at all.

**Is the sheet private?**
No, and it must not be. Anyone with the link can read the sheet and the photo folder — that is
how the website reads them. So: **no cost prices, no supplier names, no customer details, and no
personal photos** in either. Only things that are about to be public anyway.

**Do I have to press Publish every time?**
Only if you want it live immediately. Automatic publishing picks up changes on its own within
about ten minutes, and there is a daily check at 8am as a backstop.
