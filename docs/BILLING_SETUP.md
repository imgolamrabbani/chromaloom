# ChromaLoom — Polar.sh Billing & License Key Setup ($0/mo MoR)

ChromaLoom reuses the live **$0/month Polar.sh** organization **`bani`** (`c9b3a57f-c07f-4f81-b9b8-aa9f5b497a1e`) and Polar's public Customer Portal License Keys API over `chrome.storage.local` / `browser.storage.local`. **Zero secret API keys are shipped in the browser extension.**

---

## Step 1: Create the ChromaLoom License Key Benefit
1. Open [polar.sh/dashboard/bani](https://polar.sh/dashboard/bani) → **Products → Benefits → + New Benefit**.
2. Select **License Keys** and configure:
   - **Description:** `ChromaLoom Pro License (Up to 3 browsers/machines)`
   - **Prefix:** `CHROMA`
   - **Activation Limit:** `3` (allows use across Edge, Firefox, and Chrome profiles; seats can be freed anytime from the extension's License panel)
   - **Expiration:** `Never` (Polar automatically revokes keys on canceled monthly subscriptions)
3. Save the benefit.

---

## Step 2: Create ChromaLoom Pro Products
Go to **Products → + New Product** in `bani` and create:

1. **ChromaLoom Pro — Early Bird (Perpetual One-Time)**
   - **Pricing:** One-time purchase — **$19 USD** (Standard later: **$24 USD**)
   - **Benefits:** Attach `ChromaLoom Pro License (Up to 3 browsers/machines)`
2. **ChromaLoom Pro — Monthly (Optional)**
   - **Pricing:** Recurring Monthly — **$5 USD / month**
   - **Benefits:** Attach `ChromaLoom Pro License (Up to 3 browsers/machines)`

---

## Step 3: Generate Checkout Links
1. Go to **Products → Checkout Links → + New Checkout Link**.
2. Generate links for:
   - **ChromaLoom Pro — Early Bird ($19)** → set as `POLAR_CHECKOUT_URL_EARLY_BIRD` / `POLAR_CHECKOUT_URL_LIFETIME`
   - **ChromaLoom Pro — Monthly ($5/mo)** → set as `POLAR_CHECKOUT_URL_MONTHLY`
3. Copy `.env.example` to `.env` inside `products/chromaloom/` and paste the live `https://buy.polar.sh/...` URLs.
4. Wire the checkout URLs into `products/chromaloom/app/src/popup/App.tsx` and `products/chromaloom/website/index.html` before packaging the Edge/Chrome & Firefox zips.

---

## Step 4: Verify Activation Flow
1. Issue a test key from **Products → Benefits → License Keys** in Polar Dashboard.
2. Open the ChromaLoom popup in Edge or Firefox → click **Pro / License** → paste the `CHROMA-...` key and click **Activate**.
3. Verify WCAG 2.2/APCA Contrast Auditor, Design Token Exporter, and Gradient Inspector / Swatch Boards unlock immediately, and clicking **Deactivate** frees the slot.
