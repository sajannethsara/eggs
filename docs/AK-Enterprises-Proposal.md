# AK Enterprises Operations System: Proposal & UI/UX Specification

2026-11-15 · @Calex Labs

## 1. Executive summary

AK Enterprises needs one internal system that links its 5 outlets, warehouse, delivery fleet and office, so the owner no longer collects information shop by shop. The proposal is five connected apps on one shared database, built on six data units, with every automated action held for human review.

**Problems it solves** (from the group report, Chapters 2–5):

- Records are split across a single POS, handwritten books and Excel, and profit is consolidated by hand.
- Stock is not visible across outlets, and eggs spoil often.
- Orders and deliveries are not tracked, so deliveries run late and cash collection is hard to check.
- Leave and rosters depend on the owner personally.
- Knowledge about suppliers and customers sits with individual people.

**The five apps**

| App | Device | Primary user | Core purpose |
|---|---|---|---|
| Owner app | Android phone | Owner / MD | Monitor, approve, own key relationships, assign work |
| Office desktop | Office PC (Windows) | Office staff | Central hub: orders, rates, profiles, review inbox, call capture |
| POS desktop | Touchscreen PC at each outlet | Cashier | Billing, returns, spoilage, cash close |
| Driver app | Android phone | Driver | Stop list, delivery or pickup, payment, signature |
| Warehouse app | Android tablet or phone | Warehouse keeper | Receive, transfer, count, spoilage |

Customers and suppliers never log in. They take part through calls, WhatsApp, signatures on the driver's phone and SMS or WhatsApp receipts, and staff record and monitor all of it inside the system.

## 2. Design principles

The design rests on one idea: everything that happens in the business is goods or money moving from one holder to another, and every move starts as a request that a person approves.

![system architecture · 5 apps, 1 core, 6 data units](diagram-1.jsx) *(diagram source: React/JSX SVG; view it rendered in the online doc)*

Every app reads and writes the same six units, so a sale at any outlet updates stock, credit and the owner's dashboard at once.

1. **Few building blocks.** Six data units cover sales, purchasing, stock, credit, HR and tasks. A new feature is usually a new Request type, not a new table.
2. **Rules propose, people decide.** Any instruction can be automated, but automation only creates *Proposed* Requests. A person approves before anything happens.
3. **The office desktop is the hub.** Office staff keep profiles and rates up to date and review the inbox. They turn calls into data with quick, simple entry.
4. **Nothing is overwritten.** Prices are new Rate rows, and corrections are reversing Movements, so history and the audit trail come for free.
5. **Totals are calculated, never typed.** Stock, balances, driver cash and profit are always derived from Movements, so records can't disagree.
6. **Each app shows only what its user needs.** Every screen is built around the user's next action, not around the database.

## 3. Users, roles and permissions

There are five internal roles, one per app. Customers and suppliers are recorded as Parties but never log in. One office staff member also acts as system admin for user accounts and backups.

| Role | People (approx.) | App | Can approve |
|---|---|---|---|
| Owner / MD | 1 (Kusal) | Owner app (+ office desktop if needed) | Everything; the only approver for owner-only contacts, credit limits, discounts above the threshold and leave |
| Office staff | 2–3 | Office desktop | Orders, routine purchases, price changes (logged), delegated call tasks, route plans |
| Cashier | 1 per outlet (5) | POS desktop | Walk-in sales, returns up to a set value |
| Driver | 2–3 | Driver app | Nothing; completes approved deliveries and pickups |
| Warehouse keeper | 1 | Warehouse app | Receiving against an approved purchase, transfers proposed by the system |

Delivery supervisor duties (reassigning stops, handling breakdowns) are a permission that can be given to a senior office staff member or a senior driver, not a separate app.

**Permission matrix** (V = view, C = create, A = approve, — = no access)

| Data | Owner | Office | Cashier | Driver | Warehouse |
|---|---|---|---|---|---|
| Customer and supplier profiles | V C A | V C | V (name, credit status) | V (own stops) | V (suppliers) |
| Rates (prices) | V A | V C | V (sell price) | V (amount due) | V |
| Owner-only contacts and call notes | V C A | V (if assigned) | — | — | — |
| Orders and purchases | V A | V C A | C (walk-in sale) | V (own route) | V (purchases) |
| Stock | V | V | V (own outlet) | V (own load) | V C |
| Credit and cheques | V A | V C | C (credit sale, within limit) | C (payment taken) | — |
| Profit and reports | V | V (operational) | — | — | — |
| Employee records, leave | V A | V C | C (own leave) | C (own leave) | C (own leave) |

## 4. Data model: six units

Three reference units change slowly and are maintained by office staff. Three activity units are written every day by everyone.

### Reference data

**Party** is anyone or anything that can hold goods or money, or do work.

| Field | Example |
|---|---|
| type | customer · supplier · employee · outlet · warehouse · vehicle · system (Loss, Bank, Cash office) |
| name, phone, WhatsApp, address | "Hotel Lakview", 07X…, Kelaniya |
| segment | B2C walk-in · B2B regular · B2B big (orders monthly in bulk) |
| contact tier | owner-only · can delegate · staff |
| credit limit, credit days | Rs 150,000 · 30 days |
| usual order, usual day, delivery window | 300 eggs + 20 coconuts · Mon/Thu · 7:30–9:00 a.m. |
| route position | stop order on a named route |
| role, outlet, pay rate (employees) | Cashier · Outlet 2 |
| status | active · paused · blocked |

**Item** is a product that is sold.

| Field | Example |
|---|---|
| name, unit, pack size | Eggs · piece · tray of 30 |
| holding period | 2 days (eggs), 30 days (coconut oil) |
| reorder level per holder | Outlet 1: 10 trays |
| perishable flag, barcode, POS button colour | yes · — · yellow |

**Rate** is a price for an item, valid from a date. A price change adds a new row; old rows are kept as history.

| Field | Example |
|---|---|
| item, party (blank = standard) | Eggs · Supplier: Perera Farm |
| direction | buy or sell |
| price, valid from | Rs 42.00 · 2026-11-15 |
| source note, entered by, approved by | call on 15 Nov · office staff · owner |

### Activity data

**Note** is what someone heard or saw.

- Fields: party, item (optional), channel (call, WhatsApp, visit, complaint, photo, signature), text, attachment, created by and time.
- A Note can be turned into a Request with one click.

**Request** is something that should happen.

| Field | Values |
|---|---|
| type | sale order · purchase · transfer · return/replacement · spoilage · price change · credit limit change · call task · collection · leave · shift · cash handover |
| from party → to party | Warehouse → Outlet 3 |
| lines | item, quantity, rate (rate filled in from the current Rate) |
| due, time window | 16 Nov, 7:30–9:00 a.m. |
| assigned to | a driver, an office staff member, the owner |
| status | Proposed → Approved → In progress → Done, or Rejected |
| created by | a person or a named rule |
| approved by, reason | user and timestamp; reason when rejected or edited |

**Movement** is something that did happen. Movements are never edited; a mistake is fixed with a reversing Movement linked to the original.

| Field | Values |
|---|---|
| request | the Request it completes (walk-in sales create their own) |
| what | an item and quantity, or money and amount |
| from → to | Customer → Driver (cash) · Outlet 2 → Loss (spoiled eggs) |
| method (money) | cash · cheque (number, bank, date) · credit · bank transfer |
| proof | signature image, signer name, photo |
| by, time, device, sync state | driver, 08:12, Driver phone 2, synced |

### Calculated views (never stored)

| View | Calculated from |
|---|---|
| Stock at a holder | item Movements in minus out |
| Days in stock (freshness) | age of the oldest unsold batch against the holding period |
| Customer balance / supplier payable | money Movements against goods Movements at their Rates |
| Driver cash in hand | cash Movements to the driver minus handovers |
| Profit | (sell Rate − buy Rate) × quantity, minus Loss and expenses |
| Overdue cheques | cheque Movements past their date without a Bank Movement |

## 5. Automation rules and the review gate

Automation may only create Requests with status *Proposed*. Only a person can approve them, and only an approved Request can create Movements.

**How a proposal is reviewed**

1. A rule fires and creates a *Proposed* Request, with its reason in plain words ("Outlet 3 eggs will run out tomorrow at the usual rate of sale").
2. The Request goes to the right reviewer's inbox, chosen by Request type and the Party's contact tier.
3. The reviewer chooses **Approve**, **Edit then approve** (for example, change the quantity) or **Reject** (pick a reason).
4. Approved Requests go to whoever carries them out: a driver's stop list, the warehouse transfer list, or a staff task list.
5. Edits and rejections are counted per rule. If a rule is often rejected, office staff tune its settings.

**Starting rule set** (all thresholds are settings that office staff can change)

| Rule | Trigger | Proposes | Reviewer |
|---|---|---|---|
| Low stock | Stock at a holder falls below the reorder level | Transfer from the warehouse, or a purchase if the warehouse is also low | Office staff |
| Freshness | Batch reaches 75% of its holding period (eggs: about 36 hours) | Transfer to a busier outlet, or a discount on that batch | Office staff (owner if discount is over the threshold) |
| Regular order | Usual order day for a B2B customer | Sale order with the usual lines | Office staff confirm by call |
| Supplier order day | Usual purchase day for a supplier | Purchase with suggested quantities | Owner for owner-only suppliers, otherwise office staff |
| Quiet big customer | A big customer has not ordered for 10 days | Call task | Owner |
| Cheque due | Cheque date is 2 days away | Collection or bank-deposit task | Office staff |
| Overdue credit | Balance is past its credit days | Call task, and "hold credit" flag on the profile | Office staff; owner for big customers |
| Price change | A supplier buy Rate goes up | New sell Rates keeping the current margin | Owner |
| Leave check | Leave request on a day with forecast high orders | Leave request marked "leaves day short" with a suggested cover | Owner |
| Route plan | Approved orders for tomorrow | Stop list per driver, in route order | Office staff |
| Cash handover | Driver ends the route | Handover Request for the cash in hand | Office staff count and approve |

Phase 3 adds AI forecasting to the low stock, regular order and leave check rules. The review step stays the same; only the quality of the proposals improves.

## 6. Customer and supplier interactions

Customers and suppliers have no app or login. Every contact with them goes through a staff member, who records it, so the business can see, monitor and act on each relationship.

| Touchpoint | How it happens | Recorded as | Who sees it |
|---|---|---|---|
| Order by call or WhatsApp | Office staff take it during the call | Note → sale order Request | Office, owner |
| Owner's relationship call | Owner calls from the Owner app | Note on the Party (call log) | Owner; assigned staff |
| Delivery | Driver hands over goods | Goods Movement, money Movement, customer signature | Office live, owner dashboard |
| Supplier pickup | Driver collects goods | Goods Movement, supplier signature, quantity and price confirmed | Office, warehouse |
| Receipt | Automatic SMS or WhatsApp after a delivery is signed | Attached to the Movement | Customer |
| Payment reminder | Office staff send a template message, reviewed before sending | Note + collection Request | Office, owner |
| Complaint or return | Call, or at the counter | Note → return/replacement Request, linked to the original sale | Office, owner (spoilage report) |
| Price change from a supplier | Supplier tells the owner or staff | Note → price change Request → new Rate | Owner approves |

**Monitoring each relationship.** Every Party profile shows a single timeline of Notes, Requests and Movements, plus four health signals:

- **Order rhythm:** days since the last order against the usual gap.
- **Payment behaviour:** average days to pay and any bounced cheques.
- **Complaints:** returns in the last 90 days.
- **Last contact:** who called last, and when.

A profile turns amber when one signal slips and red when two do. The owner sees all red profiles on the dashboard.

**Outgoing messages.** The system never sends a message to a customer or supplier without a person's review, except the delivery receipt, which only confirms what they just signed for. WhatsApp messages open in the staff member's WhatsApp, already filled in, using a click-to-chat link, so no paid API is needed in phase 1.

## 7. Global UX guidelines

The aim is that a new cashier or driver can do their main task after a 30-minute walkthrough, against the 2 months the current POS took to learn.

**Language and words**

- Every app works in **Sinhala and English**, switchable per user; Tamil can be added later.
- Use the business's own words: "bill", "trip", "credit", "cheque". Avoid system words such as "Movement" or "Request" on screen.
- Show numbers as Rs 1,250.00 and dates as 15 Nov.

**One screen, one job**

- Each home screen shows **today's work** first: the next stop, the next bill, the next approval.
- One main action per screen, as a large button at the bottom (phones) or bottom right (desktop).
- No more than 5 fields on any form. The rest is filled in from the profile, the Rate or the last order.

**Touch and readability**

- Touch targets of at least 48 × 48 px on phones and 64 × 64 px on the POS.
- Body text at least 16 px on phones and 18 px on the POS; numbers bold.
- High contrast so screens are readable in sunlight on a delivery route.

**Consistent colours** (always paired with an icon or word, never colour alone)

| Colour | Meaning |
|---|---|
| Green | Done, paid, fresh |
| Amber | Needs attention, due soon, aging stock |
| Red | Overdue, short, spoiled, failed |
| Blue | Waiting for review |
| Grey | Not started |

**Mistakes are safe**

- Every completed action shows an **Undo** for 10 seconds; after that, a correction is a reversal with a reason.
- Confirm only actions that affect money or can't be undone, and say the amount in the confirm button: "Collect Rs 12,400 cash".
- Errors say what to do next: "No signal. Saved on this phone; it will send when you're back online."

**Offline first** (POS, driver and warehouse apps)

- Every action works without internet and syncs later.
- A small status chip always shows: *Online*, *Offline – 3 waiting*, or *Synced 08:42*.

**Built-in help**

- A **?** on every screen opens a 3–5 step picture guide for that screen (the SOPs from Chapter 6).
- First-use tips appear once per screen and can be replayed from the profile menu.

## 8. Owner mobile app

The owner's app answers three questions in under a minute: how is the business today, what needs my decision, and who should I call. It is built for one-handed use between visits.

**Navigation:** a bottom bar with 5 tabs: **Today · Approve · Work · Contacts · Reports**. Badges show counts on Approve and Work.

### 8.1 Today (home)

- **Top:** greeting and date, plus a sync chip.
- **4 KPI cards** in a 2 × 2 grid. Tap one to open the detail.
  - Sales today (all outlets) against the same weekday last week
  - Cash and cheques collected today against what is due
  - Stock alerts (low or aging)
  - Late deliveries right now

- **Outlet strip:** a horizontally scrolling card for each outlet with sales so far, stock alerts and an online status dot.
- **Red profiles:** customers and suppliers whose health has slipped (section 6), with tap-to-call.
- **Live feed:** the last 10 important events ("Driver 2 delivered to Hotel Lakview, Rs 18,200 cheque").

### 8.2 Approve

- A single list of everything waiting for the owner, grouped by type: price changes, discounts, credit limits, leave, large purchases, rejected-by-staff escalations.
- **Each card shows:** what, why (the rule's reason or the staff note), the money impact, and who is affected.
- **Actions:** swipe right to approve, swipe left to reject (pick a reason), or tap to open and edit.
- **Leave cards** show the day's forecast load and who else is off, with "Approve" or "Approve with cover: [suggested staff]".
- **Bulk approve** for routine items, such as approving all 6 standard purchases at once.

### 8.3 Work to do / Assign work

This keeps key relationships with the owner while letting routine contacts go to staff.

- **My calls today:** call tasks for owner-only contacts, created by rules (usual order day, quiet big customer, supplier price check) or by the owner. Each row has the name, the reason, the last contact date and a large **Call** button.
- **After a call:** a bottom sheet opens with quick outcome chips (*Ordered*, *Price changed*, *Call back*, *No answer*, *Issue*). There is also a voice-to-text note and an optional follow-up: **+ Order**, **+ New price**, **+ Assign to staff**.
- **Assigned to staff:** tasks the owner handed over, with assignee, due date and status (*Open*, *Done*, *Needs owner*). Tap to read the staff member's notes.
- **+ New task:** pick a contact, pick a task type (call, follow up, collect, negotiate), pick the staff member, set a due date and add instructions. Four taps and an optional note.
- **Reassign:** long-press any of the owner's own tasks and choose "Give to…". Owner-only contacts show a lock icon, and assigning them asks for confirmation, so the decision is deliberate.

### 8.4 Contacts

- Search plus filter chips: *Big customers*, *Suppliers*, *Owner-only*, *Overdue*, *Red*.
- **Profile:** a header with name, tier, health signals and balance; buttons for Call and WhatsApp; then the timeline of calls, orders, deliveries, payments and complaints.
- From a profile the owner can change the tier, the credit limit, or hold credit. Each change is logged.

### 8.5 Reports

- **Profit:** this month against last month, by outlet and by item, calculated from Rates and Movements.
- **Sales trend:** a line chart per outlet for the last 12 weeks.
- **Spoilage:** losses by item, outlet and supplier.
- **Credit:** ageing (0–30, 31–60, over 60 days) and cheque calendar.
- **Bank pack:** one button builds the debtors, creditors, stock and profit summary as a PDF for loan applications.

**Notifications to the owner** are limited to what needs him: approvals, red profiles, a delivery more than 30 minutes late, a cash shortage at handover, and a vehicle breakdown.

## 9. Office staff desktop (central hub)

The office desktop is where the business's information is kept correct. Staff turn calls into data, keep profiles and prices current, review what the system proposes, and run the day's deliveries. It is designed for keyboard speed as well as mouse use.

**Layout:** a left sidebar with 6 sections, **Inbox · Orders · Deliveries · Stock · Directory · Money**, plus **Staff** and **Reports** below a divider. A **Quick capture** bar is always pinned at the top of every screen.

### 9.1 Quick capture (always visible)

This is how staff record a call in a few seconds.

1. Press **F2** or click the bar, then type a name or phone number. The matching Party appears with its balance, tier and usual order.
2. Type the note in plain words: "wants 300 eggs + 20 coconuts tomorrow morning".
3. Pick what the note becomes with one key: **O** order · **P** price change · **C** complaint · **T** task · **N** note only.
4. The matching form opens already filled in: items and quantities from the note or the usual order, prices from the current Rates, the delivery window from the profile. Staff check it and press **Enter**.

An unknown caller can be saved as a new Party with just a name and phone number; the rest is filled in later.

### 9.2 Inbox (review queue)

- **Three tabs:***For me*, *Waiting on owner*, *All*.
- **Each row shows:** type icon, what, why, money impact, created by (a person or a rule), and age.
- **Keyboard:****A** approve · **E** edit · **R** reject with reason · **↓** next.
- **Right panel:** the full Request with the Party's timeline, so staff never need to switch screens to decide.
- Items over a staff member's limit show **Send to owner**, which moves them to the owner's Approve tab.

### 9.3 Orders

- A board with columns **New → Confirmed → Packed → Out → Delivered → Paid**, filtered by date and outlet.
- Cards show customer, items, value, time window and a credit warning if any.
- Drag a card to change status; a late order turns red with the minutes overdue.
- **Repeat order:** right-click a past order and choose "Order again for [date]".

### 9.4 Deliveries

- **Route planner for tomorrow:** approved orders on the left, driver columns on the right. The system proposes an order for the stops; staff drag to change it, then click **Send to drivers**.
- **Live today:** each driver's progress as "6 of 11 stops, Rs 42,300 collected". Missed and late stops are highlighted.
- **Breakdown handling:** select a driver, click **Move stops**, pick another driver and the stops move to their list.
- **Cash handover:** at the end of the route, the driver's expected cash and cheques are listed. Staff count, enter the actual amount and approve; any difference is recorded with a reason and goes to the owner if it is over the threshold.

### 9.5 Stock

- A grid of **items × holders** (warehouse, 5 outlets, vehicles). Each cell shows quantity and a freshness colour.
- Click a cell to see its batches and movement history.
- **Transfers** and **purchases** proposed by rules appear here too, with an approve button.

### 9.6 Directory (profiles and rates)

- **Parties:** a table of customers, suppliers and staff with filters. The profile editor has tabs: *Details*, *Terms* (credit limit, days, tier), *Usual order*, *Timeline*.
- **Rates:** a price list with one row per item: current buy price, current sell price and margin. Click **New price**, enter the price and the date it starts, and add a source note ("supplier call"). The old price stays in the history graph next to it. Price changes over the threshold go to the owner.
- **Items:** name, unit, holding period, reorder levels per holder.

### 9.7 Money

- **Receivables:** customer balances by age, with **Call** and **Send reminder** (opens WhatsApp with a filled-in message to check before sending).
- **Cheques:** a calendar of cheque dates; mark each as *Deposited*, *Cleared* or *Bounced*.
- **Payables:** what is owed to each supplier and when.
- **Expenses:** quick entry for fuel, rent and repairs, so profit is complete.

### 9.8 Staff

- Roster for the week (drag staff into outlet or route slots).
- Leave requests with the system's shortage warning; office staff can approve routine leave if the owner has delegated it, otherwise the request goes to the owner.
- Employee profiles, and the training guide library.

### 9.9 My tasks

Tasks the owner assigned to this staff member appear as a badge in the sidebar and as a list on the Inbox. Each task shows the owner's instructions, the contact's history and outcome buttons: *Done*, *Call back on [date]*, *Needs owner*.

## 10. Cashier POS desktop

The POS has one goal: bill a customer in under 20 seconds with no training beyond the first day. It runs on a touchscreen PC with a receipt printer and cash drawer at each outlet, and works fully offline.

**Layout of the billing screen** (one screen, no menus during a sale)

- **Left 60%:** large product tiles in a grid, coloured by category, with the price on each tile. Eggs, coconuts, coconut oil and rice are always in the first row; a search box above the grid finds the rest.
- **Right 40%:** the bill. Each line shows item, quantity with **−** and **+** buttons, and amount. The total sits at the bottom in large bold numbers.
- **Bottom right:** three payment buttons, **Cash · Credit · Cheque**.
- **Top bar:** outlet name, cashier name, sync chip, and a **Menu** button for less common tasks.

**Selling**

1. Tap a tile to add one; tap again to add another, or tap the quantity to type it (for trays, for example 3 trays).
2. Tap **Cash**. A keypad appears with quick buttons for common notes (Rs 500, 1,000, 5,000). The change due is shown large.
3. Tap **Done**. The receipt prints, the drawer opens, and the screen is ready for the next customer.

**Credit sale:** tap **Credit**, then search the customer. The screen shows their limit and current balance. If the sale would go over the limit, the button changes to **Ask office**, which sends a Request to the office inbox; the cashier can hold the bill while waiting.

**Cheque:** enter the cheque number, bank and date. The cheque goes to the office's cheque calendar.

**Menu tasks** (each a single short screen)

| Task | What the cashier does |
|---|---|
| Return / replacement | Find the bill (or scan its code), tap the item, pick a reason (spoiled, broken, wrong item), choose replace or refund. Large refunds go to the office for approval. |
| Report spoilage | Tap the item, enter the quantity, pick a reason and optionally take a photo. Stock moves to Loss. |
| Receive transfer | Open the incoming transfer from the warehouse, confirm or correct the quantities, tap **Received**. |
| Stock check | Count the items the system shows for today's check (5–10 per day), enter counts; differences go to the office. |
| Day close | The system shows expected cash; the cashier counts notes by denomination, and any difference is recorded with a note. Prints the day summary. |
| My leave | Request a day off; see approval status. |

**Helping the cashier**

- Tiles of items that are aging show an amber corner, so the cashier can offer them first.
- A low stock warning appears on a tile when stock runs low, and the low stock rule has already proposed a transfer.
- Prices update automatically when the office approves a new Rate; the cashier never edits prices.

## 11. Driver app

The driver app is a list of stops, worked from top to bottom, with no map. Each stop ends with the payment method and a signature on the phone. It is usable with one thumb, in sunlight, and without signal.

### 11.1 Start of day

- Log in with a 4-digit PIN.
- **Load check:** a list of what should be on the vehicle. The driver ticks each line or corrects the quantity, then taps **Start route**. This records stock moving from the warehouse to the vehicle.

### 11.2 Today's stops (home)

- **Top:** route name, "4 of 11 done", and cash in hand (Rs).
- **The list:** one card per stop in route order. The next stop is expanded and highlighted; the rest are collapsed.
- **Each card shows:**
  - Stop number, name and type icon (delivery or supplier pickup)
  - Address and landmark note ("blue gate next to the pharmacy")
  - Time window, which turns red when late
  - Items to drop off or pick up
  - Amount to collect, including any old balance ("Rs 12,400 today + Rs 6,000 old balance")
  - A **Call** button

- **Status chips:***Next*, *Done*, *Skipped*, *Problem*.
- Drivers can drag a stop to change the order if the road requires it; office staff see the change.

### 11.3 Completing a delivery stop

1. **Confirm items.** Tap **Arrived**. Items are listed with ticks. If something is short or damaged, tap the line and change the quantity with a reason.
2. **Choose payment method.** Four large buttons: **Cash · Cheque · Credit · Part payment**.
  - Cash: enter the amount received (pre-filled with the amount due).
  - Cheque: cheque number, bank and date, plus a photo of the cheque.
  - Credit: shows the remaining limit; blocked if the customer is on credit hold, with a **Call office** button.
  - Part payment: amount received now, and the rest goes to credit.

3. **Customer signature.** A full-screen white pad shows the summary at the top ("300 eggs, 20 coconuts · Rs 18,200 · Cheque"). The customer signs with a finger and their name is typed or chosen from known contacts at that business. Buttons: **Clear** and **Confirm**.
4. **Done.** A green tick, the receipt goes by SMS or WhatsApp, and the next stop opens.

### 11.4 Completing a supplier pickup

The same steps, in the other direction: confirm quantities collected, check the price shown against what the supplier says (any difference becomes a price change Request for the office), record payment if paid on the spot, and get the **supplier's signature**.

### 11.5 Problems

A **Problem** button on every stop offers: *Customer not there*, *Refused goods*, *Can't reach*, *Vehicle breakdown*. Each sends an alert to the office. A breakdown also lets the office move the remaining stops to another driver; the driver sees them disappear with a message.

### 11.6 End of day

- **Return check:** goods left on the vehicle go back to the warehouse.
- **Cash handover:** the app shows the cash and cheques expected; the office counts and confirms on the desktop, and the driver sees **Handover accepted**.

**Offline:** every step is saved on the phone and sent when the signal returns. The sync chip shows how many stops are waiting to send.

## 12. Warehouse keeper app

The warehouse app replaces the stock book. Its home screen is four large buttons and a to-do list, so the keeper always knows what to do next.

**Home screen**

- **Four large buttons:****Receive · Send · Count · Spoiled**.
- **To-do list below:** approved purchases arriving today, approved transfers to send, today's count list, and batches about to age out.
- **Freshness strip:** each perishable item with a bar showing how much of its holding period has passed (green, amber, red).

### 12.1 Receive

1. Pick the expected delivery from the list (from an approved purchase or a driver's signed pickup), or tap **Unexpected delivery**.
2. Items and expected quantities are listed. Tap **All correct**, or change any line and pick a reason (short, damaged, poor quality).
3. Optional photo of damaged goods; it is linked to the supplier for the spoilage report.
4. Tap **Received**. Stock goes up and a new batch is created with today's date, so freshness is tracked.

### 12.2 Send (transfers)

- Approved transfers are listed by outlet ("Outlet 3: 10 trays eggs, 40 coconuts").
- The app suggests the **oldest batch first**, so eggs leave in the order they arrived.
- Tap **Packed**, then **Handed to driver** or **Sent**. The outlet confirms on its POS when goods arrive; any difference shows on both sides.
- **+ New transfer** lets the keeper propose one; it goes to the office inbox.

### 12.3 Count

- Each day the system lists 5–10 items to count, so everything is counted over a fortnight without a big stock-take day.
- Shows one item at a time, with a large number pad. The expected quantity is hidden until the count is entered, so the count is honest.
- Differences over a set percentage go to the office as a stock adjustment Request.

### 12.4 Spoiled

- Pick the item, enter the quantity, choose a reason (*cracked*, *rotten*, *expired*, *pests*), and take a photo if possible.
- The app suggests which batch it came from, so spoilage can be traced back to a supplier delivery.

**Stock lookup:** a search bar on every screen shows any item's quantity at every holder, so the keeper can answer "does Outlet 2 have oil?" without calling.

## 13. End-to-end flows across apps

The apps work as one because each step finishes a Request that the next app is already waiting for. Nobody re-enters data.

![order to cash · 7 steps across 5 apps](diagram-2.jsx) *(diagram source: React/JSX SVG; view it rendered in the online doc)*

The signed delivery is the key step: it moves stock, records the money and updates the customer's balance at once. Walk-in sales at the POS draw from the same stock, so the owner sees one picture.

**Price change from a supplier**

1. Supplier tells the owner on a call: eggs up to Rs 44. *Owner app:* the owner taps **+ New price** after the call.
2. *Core:* a new buy Rate is proposed, and the price rule proposes matching sell Rates that keep the margin.
3. *Owner app:* the owner approves or edits the sell prices.
4. *All apps:* POS tiles, driver amounts due and office order forms use the new price from its start date.

**Owner delegates a call**

1. *Owner app:* the "quiet big customer" rule puts Hotel Lakview in My calls. The owner assigns it to an office staff member with the note "ask about weekend order".
2. *Office desktop:* the task appears in My tasks with the profile history. Staff call and pick *Done* and **+ Order**.
3. *Owner app:* the task shows Done, with the note and the new order.

**Low stock replenishment**

1. *Core:* Outlet 3 eggs fall below the reorder level; a transfer is proposed, taking the oldest batch first.
2. *Office desktop:* staff approve it in the Inbox.
3. *Warehouse app:* the transfer appears in Send; the keeper packs and hands it to the driver.
4. *POS (Outlet 3):* the cashier confirms receipt. Any difference shows on both sides.

**Complaint and replacement**

1. *Office desktop:* a customer calls about cracked eggs. Quick capture → **C** complaint, linked to the original delivery.
2. *Office desktop:* the replacement Request is approved and added to tomorrow's route.
3. *Driver app:* the driver delivers the replacement and collects the bad trays; the customer signs.
4. *Owner app:* the spoilage report counts it against the egg supplier and batch.

**Leave request**

1. *Any app:* a driver requests Saturday off.
2. *Core:* the leave check sees a forecast busy Saturday and marks it "leaves day short", suggesting a cover.
3. *Owner app:* the owner approves with the cover; both staff and the roster update.

## 14. Notifications

Each person gets only the alerts they can act on; everything else waits in a list. Push alerts go to phones, and desktop alerts appear as a badge plus a sound for urgent items.

| Event | Owner | Office | Cashier | Driver | Warehouse |
|---|---|---|---|---|---|
| Item waiting for my approval | Push | Badge | — | — | — |
| Task assigned to me | — | Badge + sound | — | — | — |
| Delivery late by 30+ min | Push | Badge + sound | — | On the stop card | — |
| Vehicle breakdown | Push | Badge + sound | — | — | — |
| Stops moved to or from me | — | — | — | Push | — |
| Cash handover difference over threshold | Push | Badge | — | On handover screen | — |
| Credit sale over limit (Ask office) | — | Badge + sound | Answer on screen | — | — |
| Transfer on its way | — | — | Banner | — | — |
| Purchase arriving today | — | — | — | — | To-do list |
| Batch close to holding limit | Daily summary | Badge | Amber tile | — | Freshness strip |
| Cheque due in 2 days | Daily summary | Badge | — | — | — |
| Profile turned red | Push | Badge | — | — | — |
| My leave approved or rejected | — | Push | Push | Push | Push |

**Owner's daily summary** at 8:00 p.m.: today's sales and collections, tomorrow's calls, cheques due, aging stock and anything still waiting for him. Quiet hours run from 10:00 p.m. to 6:30 a.m., except breakdowns.

## 15. Technical architecture, offline and security

A single cloud backend with one PostgreSQL database serves all five apps through one API. The phone apps are built with one cross-platform codebase, and the two desktop apps as web apps that install on the PC, which keeps the build to two front-end projects.

| Layer | Suggested choice | Why |
|---|---|---|
| Database | PostgreSQL (managed cloud) | Reliable; the six units map to six main tables |
| Backend API | One service (for example Node.js or Django) with the review gate and rules engine | Rules and permissions live in one place |
| Owner, driver and warehouse apps | Flutter (Android first) | One codebase for three phone apps; works offline with a local database |
| Office and POS desktops | Installable web app (PWA) | No install per PC; POS keeps a local store for offline billing |
| Messages | SMS gateway for receipts; WhatsApp click-to-chat links | Low cost in phase 1; WhatsApp Business API can come later |
| Reports and PDFs | Generated on the server | Same figures on every device |

**Why offline sync stays simple:** Movements are only ever added, never edited. A device that was offline sends its new Movements when it reconnects, and they are added in order. Two devices can't overwrite each other's work. If two outlets both sell the last 5 eggs while offline, stock goes negative and the office sees a correction Request instead of a lost sale.

**Security**

- **Role-based access** exactly as in section 3; each user sees only their outlet, route or tasks.
- **Login:** PIN plus a registered device for phones and POS; password plus a one-time code for the owner and office.
- **Audit trail:** every approval, edit, rejection and price change records who, when and from which device. Nothing is deleted.
- **Data protection:** encrypted connections (HTTPS), encrypted backups every night, and a monthly test restore.
- **Leavers:** one click disables an account and logs out all of that person's devices; their records and notes stay with the business.
- **Signatures and cheque photos** are stored with the Movement and visible only to the office and owner.

**Hardware per location** (to be checked against what already exists, Chapter 7.6)

| Location | Needs |
|---|---|
| Each outlet (5) | Touchscreen PC or all-in-one, thermal receipt printer, cash drawer, 4G router with backup SIM |
| Office | 2–3 PCs, laser printer, broadband with 4G backup |
| Warehouse | 1 Android tablet with a rugged case |
| Drivers (2–3) | Android phones with a data plan |
| Owner | Existing Android phone |

## 16. Rollout, KPIs and user stories

The system is rolled out in four phases, starting with a pilot at the main outlet, as recommended in Chapter 7. Each phase has to meet its gate before the next one starts.

1. **Phase 1, foundation and pilot.** Office desktop (Directory, Rates, Quick capture, Inbox) and POS at the main outlet. Load parties, items and opening stock from the books and Excel. *Gate:* the pilot outlet's day-close cash matches for 2 weeks.
2. **Phase 2, all outlets and the warehouse.** POS at the other 4 outlets, the warehouse app, and transfers. *Gate:* stock counts are within 2% of the system for 2 weeks.
3. **Phase 3, deliveries and the owner.** Driver app with signatures, route planning, cash handover, the Owner app and Work to do. *Gate:* every delivery is signed in the app for 2 weeks.
4. **Phase 4, HR, money and intelligence.** Leave and roster, cheque calendar, bank pack, and AI forecasting once about 6 months of data exist.

**KPIs** (baselines to be recorded before launch, Chapter 8.1)

| Area | KPI | Target after 12 months |
|---|---|---|
| Stock | Egg spoilage as a share of eggs bought | Half of the baseline |
| Stock | Stock-outs per outlet per week | Under 1 |
| Delivery | On-time deliveries in the promised window | 95% |
| Delivery | Deliveries with a signature | 100% |
| Money | Average days to collect credit | 20% lower than baseline |
| Money | Hours per month to prepare profit and bank reports | Under 1 hour |
| People | Time for a new cashier to bill alone | Under 2 weeks (from about 2 months) |
| People | Shifts left short because of leave | Under 1 per month |
| Owner | Share of system proposals approved without edits | Over 80% (shows the rules are trusted) |

**User stories**

*Owner*

- As the owner, I want to see sales, collections, stock alerts and late deliveries for all outlets on one screen, so I don't have to call each shop.
- As the owner, I want a daily list of supplier and big-customer calls that only I make, so I can protect those relationships.
- As the owner, I want to assign some calls to office staff and see their outcome, so I can delegate without losing track.
- As the owner, I want to approve price changes, credit limits and leave with one swipe, seeing the impact first.
- As the owner, I want a bank pack PDF with one tap, so loan applications don't take days.

*Office staff*

- As office staff, I want to turn a phone call into an order in a few keystrokes, with the customer's usual order and prices filled in.
- As office staff, I want to update a supplier's price once and have every app use it from the start date.
- As office staff, I want one inbox of everything the system proposes, so I can approve, edit or reject quickly.
- As office staff, I want to plan tomorrow's routes by dragging orders to drivers.
- As office staff, I want to count a driver's cash against what the system expects, so differences are found the same day.

*Cashier*

- As a cashier, I want to bill with large product buttons and quick cash keys, so a sale takes under 20 seconds.
- As a cashier, I want to see a credit customer's limit before I give credit.
- As a cashier, I want to record spoilage and returns in a few taps, so stock stays correct.
- As a cashier, I want the POS to keep working when the internet is down.

*Driver*

- As a driver, I want a simple list of today's stops in order, with what to deliver and what to collect.
- As a driver, I want to choose the payment method and then get the customer's signature on my phone, so every delivery is confirmed.
- As a driver, I want to get a supplier's signature when I collect goods, so quantities and prices can't be disputed.
- As a driver, I want to report a breakdown with one tap, so the office can move my stops.

*Warehouse keeper*

- As the warehouse keeper, I want to receive deliveries against what was ordered, marking shortages and damage.
- As the warehouse keeper, I want the app to tell me which batch to send first, so old eggs leave before new ones.
- As the warehouse keeper, I want a short daily count list instead of one big stock-take.
