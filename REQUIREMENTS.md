# Life Context Engine — Requirements Document

> **Version:** 0.1 (Draft)
> **Date:** 2026-03-20
> **Status:** Brainstorm / Discovery

---

## 1. Vision

A personal AI assistant that absorbs the random, unstructured information of everyday life — a vet visit, a doctor's prescription, a purchase invoice, a casual mention of a birthday — and transforms it into **structured memory**, **proactive reminders**, and **actionable knowledge**.

The user should be able to talk to it like they'd talk to a trusted friend who happens to have a perfect memory and the ability to look things up.

---

## 2. Problem Statement

People deal with a constant stream of life logistics:

- **Recurring tasks** with no fixed calendar entry (dog grooming every ~4 weeks, doctor follow-ups in 3 months, car service every 6 months)
- **Purchases** where warranty cards get lost, manuals are never read, and receipt details fade from memory
- **Medical information** scattered across prescriptions, verbal instructions, and appointment cards
- **Household knowledge** buried in appliance manuals nobody reads
- **Life events and facts** (birthdays, anniversaries, pet details, subscriptions) that are hard to organize

**Today's solutions fail because:**

| Solution | Why it falls short |
|---|---|
| Calendar apps | Require manual entry; don't understand context |
| Note-taking apps | Store info but don't act on it |
| Reminder apps | Need explicit setup; no intelligence |
| Smart assistants (Alexa/Siri) | Handle timers, not life context |
| Spreadsheets | Nobody maintains them |

**The gap:** No tool today can take _"Nano got groomed today, he goes once a month"_ and automatically remind you in 26 days.

---

## 3. Target Users

### Primary Persona
- **Busy individuals / families** managing household logistics, pets, health, and purchases
- Not particularly organized; want things to "just work"
- Comfortable talking to an AI via text or voice

### Secondary Personas
- **Caregivers** managing health schedules for elderly parents
- **Pet owners** juggling vet visits, grooming, medications
- **Homeowners** dealing with appliances, maintenance, warranties

---

## 4. Core Capabilities

### 4.1 Conversational Information Capture

**Description:** The user shares information in natural, unstructured language. The system extracts structured data from it.

**Examples:**

| User says | System extracts |
|---|---|
| _"Our dog Nano was groomed today, he generally gets groomed once a month"_ | **Entity:** Pet — Nano (dog) · **Event:** Grooming · **Date:** Today · **Recurrence:** ~1 month |
| _"Had my doctor's appointment, he gave me medicines for 3 months"_ | **Entity:** User health · **Event:** Doctor visit · **Date:** Today · **Follow-up:** 3 months · **Reminder lead time:** 1 week |
| _"My sister's birthday is March 5th"_ | **Entity:** Person — Sister · **Event:** Birthday · **Date:** March 5 (annual) |
| _"We subscribed to Netflix, $15.99/month"_ | **Entity:** Subscription — Netflix · **Cost:** $15.99/mo · **Start date:** Today |

**Requirements:**
- [ ] Parse natural language input to extract entities, events, dates, recurrence patterns, and relationships
- [ ] Handle ambiguous time references ("once a month", "every few weeks", "in 3 months")
- [ ] Ask clarifying questions when information is insufficient (e.g., "What's Nano's breed?" — only if relevant)
- [ ] Support corrections ("Actually, grooming is every 6 weeks, not a month")
- [ ] Maintain an evolving knowledge graph of the user's life entities and their relationships

---

### 4.2 Smart Reminders & Proactive Notifications

**Description:** Based on captured information, the system creates intelligent reminders with appropriate lead times.

**Reminder Logic:**

| Scenario | Default Reminder | Rationale |
|---|---|---|
| Recurring service (grooming, car service) | 2 days before next due date | Enough time to book an appointment |
| Medical follow-up | 1 week before | Doctors often need advance booking |
| Warranty expiration | 1 month before | Time to assess extended warranty or plan replacement |
| Birthday / Anniversary | 1 week + 1 day before | Time to buy a gift + day-of reminder |
| Subscription renewal | 3 days before | Time to cancel if unwanted |

**Requirements:**
- [ ] Auto-generate reminders from captured information with sensible defaults
- [ ] Allow user to customize reminder lead times ("remind me 3 days before, not 2")
- [ ] Support multiple reminder channels (push notification, email, in-app, SMS)
- [ ] Learn from user behavior (if user always reschedules grooming to 5 weeks, adjust the pattern)
- [ ] Handle "soft" recurrence — not rigid calendar events, but approximate patterns
- [ ] Allow snooze, dismiss, and "done" actions on reminders
- [ ] Provide a "what's coming up" summary on demand (daily/weekly digest)

---

### 4.3 Document & Invoice Processing

**Description:** The user uploads photos or PDFs of invoices, receipts, prescriptions, or other documents. The system extracts and stores structured data.

**Examples:**

| Upload | System extracts & does |
|---|---|
| Watch invoice | Brand, model, serial number, shop name, purchase date, price, payment method |
| Washing machine invoice | Brand, model, shop, date, price → **auto-lookups:** warranty period, user manual PDF |
| Medical prescription | Doctor name, medicines, dosage, duration, follow-up date |
| Vet receipt | Pet name, treatment, vet clinic, cost, next visit |
| Credit card statement | Due date, minimum payment, total outstanding, individual transactions (merchant, amount, date, category) |
| Bank statement | Account summary, recurring debits (subscriptions, EMIs), salary credits |
| Insurance policy document | Policy number, coverage, premium amount, renewal date, nominee details |

**Requirements:**
- [ ] OCR / document understanding for photos, scanned PDFs, and digital invoices
- [ ] Extract key fields: item, brand, model, serial number, date, price, seller, warranty
- [ ] Auto-categorize documents (medical, purchase, pet, vehicle, home, etc.)
- [ ] Link documents to existing entities (e.g., link washing machine invoice to "Kitchen appliances")
- [ ] Store original document alongside extracted data
- [ ] Support multi-page documents and receipts

---

### 4.4 Knowledge Lookup & Enrichment

**Description:** When the user shares a purchase or entity, the system proactively looks up relevant information.

**Auto-Lookup Triggers:**

| Trigger | Lookup |
|---|---|
| Appliance purchased | Product manual (PDF), warranty terms, common troubleshooting |
| Watch / electronics purchased | Warranty period, service center locations, care instructions |
| Medicine prescribed | Drug interactions, side effects summary, storage instructions |
| Pet breed mentioned | Breed-specific care tips, common health issues, vaccination schedules |

**Requirements:**
- [ ] Automatically search for and retrieve product manuals when a purchase is recorded
- [ ] Store manuals and reference material for later Q&A
- [ ] Look up warranty information from manufacturer databases / websites
- [ ] Provide "how-to" answers from stored manuals (e.g., "How do I clean the filter on my washing machine?")
- [ ] Cite sources when providing looked-up information
- [ ] Allow user to trigger manual lookup ("Can you find the manual for this?")

---

### 4.5 Conversational Q&A Over Life Data

**Description:** The user can ask questions about their stored information at any time.

**Example Queries:**

- _"When did we last groom Nano?"_
- _"How much did I pay for my watch?"_
- _"What medicines am I currently taking?"_
- _"When does the warranty on my washing machine expire?"_
- _"How do I run the self-clean cycle on my dishwasher?"_
- _"What's coming up this week?"_
- _"How much have I spent on pet care this year?"_

**Requirements:**
- [ ] Natural language querying over all stored life data
- [ ] Temporal reasoning ("last time", "next time", "how long ago")
- [ ] Aggregation queries ("total spent on X", "how often do I...")
- [ ] Cross-entity queries ("show me everything related to Nano")
- [ ] Answer how-to questions from stored manuals and documents

---

### 4.6 Family Context & Multi-User

**Description:** The system understands that life data belongs to a **family unit**, not just an individual. Multiple family members can contribute data, and the system understands relationships and shared context.

**Examples:**

| User says | System understands |
|---|---|
| _"My wife took Nano to the vet today"_ | Event belongs to: Pet(Nano), Person(wife). Context: family pet, not just the speaker's. |
| _"Mom's BP medicines are running out next week"_ | Entity: Person(Mom, relationship: mother). Reminder goes to the speaker, not Mom. |
| _"The kids have a school holiday on Friday"_ | Entities: Children. Context: family schedule, may affect other plans. |
| _"My husband's car is due for service"_ | Entity: Vehicle(husband's car). Reminder: to speaker or husband (configurable). |

**Family Data Model:**

```
Family Unit
├── Members
│   ├── Self (primary user)
│   ├── Spouse / Partner
│   ├── Children (with ages, schools, etc.)
│   ├── Parents / In-laws
│   └── Extended family
│
├── Shared Entities
│   ├── Pets (family pets, not one person's)
│   ├── Home (shared address, appliances)
│   ├── Vehicles (whose car, shared car)
│   └── Subscriptions (family plans)
│
├── Per-Member Data
│   ├── Health records (private by default)
│   ├── Work schedules
│   └── Personal reminders
│
└── Shared Calendar Context
    ├── School schedules
    ├── Family events
    └── Household maintenance
```

**Requirements:**
- [ ] Support a "family unit" with multiple members who can be referenced by name or relationship
- [ ] Auto-detect which family member an event relates to from context
- [ ] Allow multiple family members to contribute data (each with their own login)
- [ ] Privacy controls: some data is personal (health), some is shared (pet grooming)
- [ ] Configurable reminder routing — who gets reminded about what
- [ ] Relationship-aware context: "my wife's doctor" vs "my doctor" are different entities
- [ ] Handle possessives and pronouns correctly ("his car", "her appointment", "our dog")
- [ ] Family digest: combined view of what's coming up for the whole family

### 4.7 Financial Document Intelligence

**Description:** The user uploads credit card statements, bank statements, or insurance documents. The system extracts structured financial data, identifies recurring payments, flags anomalies, and creates relevant reminders.

**Credit Card Statement Processing:**

| Extracted Data | What the system does with it |
|---|---|
| Due date + minimum payment | Creates reminder 3 days before due date |
| Individual transactions | Categorizes spending (food, fuel, shopping, subscriptions, medical) |
| Recurring charges | Identifies subscriptions you may have forgotten about |
| EMI payments | Tracks remaining installments, flags when EMI ends |
| Reward points / cashback | Summarizes accumulated rewards |

**Example Flows:**

```
User: [uploads HDFC credit card statement PDF]
System: ✓ I've processed your HDFC credit card statement for Feb 2026.

        Summary:
        • Total outstanding: ₹47,250
        • Minimum due: ₹2,362
        • Due date: Mar 15, 2026 — I'll remind you on Mar 12

        I spotted:
        • Netflix ₹649/mo — recurring (also on Jan statement)
        • Swiggy One ₹199/mo — recurring
        • EMI: iPhone 15 — ₹4,999/mo, 8 of 12 months done (4 remaining)

        Spending breakdown:
        • Dining: ₹8,400
        • Groceries: ₹6,200
        • Fuel: ₹5,100
        • Shopping: ₹12,500
        • Subscriptions: ₹2,848

        Want me to track any of these categories month-over-month?
```

**Requirements:**
- [ ] Parse credit card statements (PDF, photo) — extract due date, amounts, transactions
- [ ] Parse bank statements — identify recurring debits, salary credits, large transactions
- [ ] Auto-categorize transactions (dining, fuel, groceries, subscriptions, EMI, etc.)
- [ ] Identify recurring charges across multiple statements (subscription detection)
- [ ] Create payment due date reminders automatically
- [ ] Track EMI progress (installments remaining, end date)
- [ ] Flag anomalies: unusual charges, significant spending increases, duplicate charges
- [ ] Month-over-month spending comparison when multiple statements are uploaded
- [ ] Support multiple cards/accounts per user
- [ ] Link transactions to known entities (e.g., a charge at PetSmart → linked to Nano)
- [ ] Insurance document parsing: policy details, premium dates, renewal reminders

---

### 4.8 Expense Tracking & External App Import

**Description:** Users often already track expenses in apps like **Finart**, Money Manager, Wallet, etc. The system should accept exported data from these apps (CSV, Excel, JSON) and enrich it with context, categorization, and subscription detection.

**Import Flow:**

```
User: [uploads Finart CSV export]
System: ✓ Imported 247 transactions from Finart (Jan 1 – Mar 20, 2026).

        I've categorized them and linked to your existing entities:

        📊 Monthly Breakdown:
        ┌───────────────┬──────────┬──────────┬──────────┐
        │ Category      │ Jan      │ Feb      │ Mar      │
        ├───────────────┼──────────┼──────────┼──────────┤
        │ Groceries     │ ₹12,400  │ ₹11,800  │ ₹9,200   │
        │ Dining Out    │ ₹8,200   │ ₹7,500   │ ₹6,100   │
        │ Fuel          │ ₹5,600   │ ₹5,400   │ ₹4,800   │
        │ Pet Care      │ ₹3,200   │ ₹1,500   │ ₹4,800   │
        │ Subscriptions │ ₹2,848   │ ₹2,848   │ ₹2,848   │
        │ Medical       │ ₹1,200   │ ₹0       │ ₹3,500   │
        │ ...           │          │          │          │
        └───────────────┴──────────┴──────────┴──────────┘

        🔄 Recurring Subscriptions Detected:
        • Netflix — ₹649/mo (every 5th)
        • Spotify — ₹119/mo (every 12th)
        • Swiggy One — ₹199/mo (every 1st)
        • Amazon Prime — ₹1,499/yr (next: Jul 2026)
        • iCloud — ₹75/mo (every 15th)

        Want me to track these subscriptions and remind you before renewals?
```

**Requirements:**
- [ ] Import expense data from CSV, Excel, JSON exports (generic + app-specific parsers)
- [ ] Support specific app formats: Finart, Money Manager, Wallet, Splitwise, etc.
- [ ] Map imported categories to the system's unified category taxonomy
- [ ] De-duplicate transactions that also appear in credit card statements
- [ ] Auto-detect recurring transactions → convert to tracked subscriptions
- [ ] Subscription tracking: renewal dates, annual cost, cancellation reminders
- [ ] Spending by segment/use-case: "How much do I spend on Nano per month?"
- [ ] Spending trends: month-over-month, category-over-category
- [ ] Budget alerts: "You've spent 80% of your usual dining budget this month"
- [ ] Link expenses to entities: PetSmart charge → Nano, Apollo Pharmacy → health
- [ ] Support periodic re-import (monthly Finart export → incremental update)
- [ ] Custom category/tag support: user-defined segments (e.g., "vacation", "home renovation")

**Query Examples:**
- _"How much did I spend on pet care this year?"_
- _"What subscriptions am I paying for?"_
- _"Which subscription costs me the most annually?"_
- _"Show me my dining expenses trend over the last 6 months"_
- _"How much am I spending on fuel compared to last quarter?"_
- _"What's my total spend this month vs last month?"_

---

### 4.9 Voice Input & On-the-Go Capture

**Description:** Users can speak naturally to capture information while driving, walking, or otherwise busy. The system handles speech-to-text and then processes the transcript like any other text input.

**Key Scenarios:**
- Leaving the vet: _"Just left the vet with Nano. He got his rabies shot and deworming. Next visit in 3 months."_
- Driving home from a shop: _"Bought a new microwave from Reliance Digital. Samsung, 28 liters. Paid 12,000 rupees."_
- Quick reminder: _"Remind me to call the plumber tomorrow morning."_
- After a phone call: _"Just spoke with the school. Parent-teacher meeting is next Saturday at 10 AM."_

**Requirements:**
- [ ] Real-time voice-to-text transcription (streaming preferred for natural feel)
- [ ] Handle accents, mixed languages (e.g., English-Hindi code-switching), and ambient noise
- [ ] Support "always listening" mode (wake word) or push-to-talk
- [ ] Process voice input through the same NLU pipeline as text
- [ ] Confirm captured information back to user (audio or visual) for verification
- [ ] Support voice queries: _"What's coming up today?"_ → spoken response
- [ ] Hands-free mode for driving (no screen interaction required)
- [ ] Works via mobile app; optionally via smart speaker integration

---

## 5. Input Modalities

| Modality | Priority | Notes |
|---|---|---|
| Text chat | P0 (MVP) | Primary interface |
| Photo upload (invoices, receipts, prescriptions) | P0 (MVP) | Core document capture |
| PDF upload | P0 (MVP) | Digital invoices and manuals |
| Voice input | P0 (MVP) | On-the-go capture; transcribed to text, then processed |
| Email forwarding | P2 | Forward receipts/confirmations to a dedicated email |
| Screenshot / screen capture | P2 | Capture info from apps |
| Calendar integration (read) | P2 | Import existing calendar events as context |

---

## 6. Output / Notification Channels

| Channel | Priority | Notes |
|---|---|---|
| In-app notifications | P0 (MVP) | Primary reminder delivery |
| Push notifications (mobile) | P0 (MVP) | Time-sensitive reminders |
| Daily/weekly digest (in-app) | P1 | Summary of upcoming events |
| Email digest | P1 | For users who prefer email |
| SMS | P2 | Critical reminders only |
| Calendar event creation | P2 | Sync reminders to Google/Apple Calendar |
| Voice assistant integration | P3 | "Hey assistant, what's coming up?" |

---

## 7. Data Model (Conceptual)

```
User
├── Entities
│   ├── People (family, friends, doctors, vets)
│   ├── Pets (name, breed, age, health records)
│   ├── Products (appliances, electronics, vehicles)
│   ├── Subscriptions (service, cost, billing cycle)
│   └── Locations (home, vet clinic, doctor's office, shops)
│
├── Events
│   ├── One-time (doctor visit on Jan 5)
│   ├── Recurring (grooming every 4 weeks)
│   └── Milestone (warranty expires Dec 2028)
│
├── Documents
│   ├── Invoices / Receipts
│   ├── Prescriptions
│   ├── Manuals
│   └── Warranties
│
├── Reminders
│   ├── Auto-generated (from events + rules)
│   └── User-created (explicit requests)
│
└── Knowledge Base
    ├── Product manuals (indexed for Q&A)
    ├── Looked-up information (warranty terms, drug info)
    └── Derived insights (spending patterns, frequency analysis)
```

---

## 8. Key User Flows

### Flow 1: Casual Information Capture
```
User: "Nano got groomed today, he goes about once a month"
System: ✓ Got it! I've noted Nano's grooming today (Mar 20, 2026).
        I'll remind you 2 days before his next grooming is due (~Apr 18).
        Want me to adjust the reminder timing?
```

### Flow 2: Medical Follow-up
```
User: "Had my doctor's appointment. He gave me medicines for 3 months."
System: ✓ Noted your doctor visit today.
        Your medicines cover through ~Jun 20, 2026.
        I'll remind you 1 week before (Jun 13) to schedule your next appointment.
        Would you like to upload the prescription?
```

### Flow 3: Invoice Processing
```
User: [uploads photo of watch invoice]
System: ✓ I've captured the following from your invoice:
        • Item: Omega Seamaster Diver 300M
        • Serial: 12345678
        • Shop: Swiss Watch Gallery, Mall of America
        • Date: Mar 15, 2026
        • Price: $5,200
        I looked up the warranty: Omega provides a 5-year international warranty.
        Your warranty expires ~Mar 15, 2031.
        I'll remind you 1 month before expiration.
```

### Flow 4: Appliance How-To
```
User: [uploads washing machine invoice]
System: ✓ Captured: Samsung WW90T684DLE, purchased from Best Buy, Mar 10, 2026.
        I've also found and saved the user manual.
        Ask me anything about how to use it!

User: "How do I clean the drum on my washing machine?"
System: According to your Samsung WW90T684DLE manual:
        1. Select the Drum Clean+ cycle...
        2. Do not add detergent or laundry...
        3. Run this cycle every 40 washes...
        (Source: Samsung User Manual, p.34)
```

---

## 9. Non-Functional Requirements

### 9.1 Privacy & Security
- [ ] All personal data encrypted at rest and in transit
- [ ] User data never used for model training
- [ ] User can export all their data at any time (GDPR compliance)
- [ ] User can delete any entity, event, document, or all data
- [ ] Document uploads processed in isolated environments
- [ ] No data shared with third parties without explicit consent
- [ ] Local/on-device processing option for sensitive data (P2)

### 9.2 Reliability
- [ ] Reminders must be delivered reliably (retry mechanism, fallback channels)
- [ ] Zero data loss — all captured information persisted durably
- [ ] System available 99.9% uptime for reminder delivery

### 9.3 Performance
- [ ] Information capture and response within 3 seconds
- [ ] Document processing (OCR + extraction) within 10 seconds
- [ ] Manual lookup and indexing within 30 seconds
- [ ] Q&A responses within 5 seconds

### 9.4 Scalability
- [ ] Support up to 10,000 entities per user
- [ ] Support up to 50,000 events per user
- [ ] Support up to 1,000 stored documents per user

---

## 10. Architecture: API-First / Headless Service

### 10.1 Design Philosophy

The Life Context Engine is **not an app** — it's a **headless backend service** that exposes all capabilities through APIs. Any client (mobile app, web app, chatbot, AI agent, voice assistant) can plug into it. The system itself has no UI opinion.

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│                                                                 │
│  Mobile App    Web App    WhatsApp    Telegram    Voice Asst.   │
│                                                                 │
│  OpenClaw    Custom AI    Slack Bot    Email      Calendar App  │
│  Agent       Agents                   Parser                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │   API GW    │  Auth, Rate Limiting, Routing
                    └──────┬──────┘
                           │
     ┌─────────────────────┼─────────────────────┐
     │                     │                     │
┌────▼─────┐   ┌───────────▼──────────┐   ┌─────▼──────┐
│  REST    │   │   MCP Server          │   │  Webhooks  │
│  API     │   │   (Model Context      │   │  (Event    │
│          │   │    Protocol)          │   │   Push)    │
└────┬─────┘   └───────────┬──────────┘   └─────┬──────┘
     │                     │                     │
     └─────────────────────┼─────────────────────┘
                           │
          ┌────────────────▼────────────────┐
          │     LIFE CONTEXT ENGINE CORE    │
          │                                 │
          │  ┌───────────┐ ┌─────────────┐  │
          │  │ NLU /     │ │ Document    │  │
          │  │ Entity    │ │ Processor   │  │
          │  │ Extractor │ │ (OCR+AI)    │  │
          │  └───────────┘ └─────────────┘  │
          │  ┌───────────┐ ┌─────────────┐  │
          │  │ Reminder  │ │ Knowledge   │  │
          │  │ Engine    │ │ Lookup &    │  │
          │  │           │ │ RAG         │  │
          │  └───────────┘ └─────────────┘  │
          │  ┌───────────┐ ┌─────────────┐  │
          │  │ Life      │ │ Query       │  │
          │  │ Graph     │ │ Engine      │  │
          │  │ (Storage) │ │             │  │
          │  └───────────┘ └─────────────┘  │
          └─────────────────────────────────┘
```

### 10.2 API Surface

#### REST API (for apps and standard integrations)

```
POST   /v1/ingest/text          — Send natural language input
POST   /v1/ingest/document      — Upload invoice/receipt/prescription (file)
POST   /v1/ingest/image         — Upload photo for processing

GET    /v1/entities             — List all entities (people, pets, products...)
GET    /v1/entities/:id         — Get entity details + linked events, docs
POST   /v1/entities             — Create entity manually
PATCH  /v1/entities/:id         — Update entity
DELETE /v1/entities/:id         — Delete entity

GET    /v1/events               — List events (filterable: upcoming, past, by entity)
GET    /v1/events/:id           — Get event details
PATCH  /v1/events/:id           — Update event (reschedule, change recurrence)

GET    /v1/reminders            — List active reminders
PATCH  /v1/reminders/:id        — Snooze, dismiss, adjust lead time
POST   /v1/reminders            — Create manual reminder

GET    /v1/documents            — List stored documents
GET    /v1/documents/:id        — Get document + extracted data
GET    /v1/documents/:id/raw    — Download original file

POST   /v1/query                — Natural language query ("when did I last...")
POST   /v1/query/howto          — How-to question (queries stored manuals via RAG)

POST   /v1/ingest/expenses       — Import expense data (CSV/Excel/JSON from Finart, etc.)
GET    /v1/expenses              — List expenses (filterable: date range, category, entity)
GET    /v1/expenses/summary     — Spending breakdown by category, time period
GET    /v1/subscriptions        — List detected/tracked subscriptions
PATCH  /v1/subscriptions/:id    — Update subscription (cancel date, notes)

GET    /v1/digest/daily         — Today's summary + upcoming reminders
GET    /v1/digest/weekly        — Week ahead summary

GET    /v1/timeline             — Chronological feed of all life events
GET    /v1/search               — Full-text + semantic search across all data
```

#### MCP Server (Model Context Protocol — for AI agent integration)

This is the **critical integration point** for agents like OpenClaw and other AI systems. MCP allows external AI agents to use the Life Context Engine as a **tool**.

**MCP Tools exposed:**

| Tool Name | Description | Example Agent Use |
|---|---|---|
| `capture_life_info` | Ingest natural language about user's life | Agent hears user mention something and logs it |
| `get_upcoming_reminders` | Fetch what's coming up | Agent proactively mentions upcoming events |
| `query_life_data` | Ask questions about stored data | Agent answers "when was Nano's last vet visit?" |
| `lookup_product_info` | Get manual/warranty for a product | Agent helps troubleshoot an appliance |
| `ask_howto` | Query stored manuals | Agent answers "how do I descale my coffee machine?" |
| `get_entity` | Retrieve details about a person/pet/product | Agent looks up context before responding |
| `add_reminder` | Create a new reminder | Agent sets a reminder on user's behalf |
| `get_daily_digest` | Get summary of the day | Agent reads out the daily brief |

**MCP Resources exposed:**

| Resource | URI Pattern | Description |
|---|---|---|
| Entity list | `life://entities` | All tracked entities |
| Entity detail | `life://entities/{id}` | Full detail of one entity |
| Upcoming events | `life://events/upcoming` | Next 30 days of events |
| Product manual | `life://manuals/{product_id}` | Indexed manual for Q&A |
| Daily digest | `life://digest/today` | Today's summary |

**Why MCP matters:**
- OpenClaw or any MCP-compatible agent can **read your life context** and **act on it** without building custom integrations
- An agent orchestrating your day can pull your daily digest, check reminders, and weave that into its planning
- Multiple agents can share the same life context layer — your calendar agent, your health agent, your shopping agent all read from one source of truth

#### Webhooks (for event-driven integrations)

External systems can subscribe to events:

```
POST   /v1/webhooks              — Register a webhook
DELETE /v1/webhooks/:id          — Remove a webhook

Events emitted:
  reminder.due          — A reminder has triggered
  reminder.upcoming     — A reminder is approaching (configurable lead time)
  entity.created        — New entity captured
  entity.updated        — Entity data changed
  event.created         — New event recorded
  document.processed    — Document upload finished processing
  warranty.expiring     — Warranty expiration approaching
```

This lets any external system (Slack bot, email service, calendar sync, home automation) react to life events without polling.

### 10.3 Authentication & Multi-Tenancy

- **API Keys** for server-to-server (agent) access
- **OAuth 2.0 / OIDC** for user-facing apps
- **MCP auth** via token-based authentication per MCP spec
- **Scoped permissions** — an agent can be granted read-only access, or write access to specific entity types only
- **Multi-tenant by design** — each user's data is fully isolated; API keys are scoped to a user

### 10.4 Agent Interaction Patterns

**Pattern 1: Agent as a Proxy (Transparent)**
```
User → OpenClaw Agent → Life Context Engine API → Response → Agent → User

Example:
User: "When is Nano's next grooming?"
OpenClaw: [calls query_life_data tool] → "April 18th"
OpenClaw: "Nano's next grooming is April 18th. Want me to book it?"
```

**Pattern 2: Agent as a Listener (Passive Capture)**
```
User → OpenClaw Agent → [Agent detects life info] → capture_life_info → Engine stores it

Example:
User: "I just got back from the dentist, next checkup in 6 months"
OpenClaw: [captures this via API] + responds naturally
Engine: [stores event, creates reminder for ~5.5 months out]
```

**Pattern 3: Agent as a Proactive Advisor**
```
Engine → [webhook: reminder.upcoming] → OpenClaw Agent → User

Example:
Engine emits: "Nano grooming due in 2 days"
OpenClaw: "Hey, Nano's grooming is due in 2 days. Want me to call PetSmart and book a slot?"
```

**Pattern 4: Multi-Agent Collaboration**
```
Health Agent → Life Context Engine ← Shopping Agent
                     ↑
              Home Maintenance Agent

All agents read from and write to the same life context,
each specializing in their domain.
```

---

## 11. MVP Scope (Phase 1)

**Goal:** Validate core value proposition — API-first, agent-ready from day one.

### In Scope
1. **REST API** — full CRUD for entities, events, reminders, documents
2. **Text ingestion endpoint** — NLU extraction from natural language
3. **Document ingestion endpoint** — OCR + structured data extraction from photos/PDFs
4. **MCP Server** — expose core tools for AI agent integration (OpenClaw, etc.)
5. **Webhook system** — event-driven notifications for reminder delivery
6. **Auto-reminders engine** — generate reminders with sensible defaults
7. **Basic Q&A endpoint** — natural language queries over stored life data
8. **Manual lookup** — find and store product manuals, support how-to queries
9. **Simple reference client** — minimal CLI or web UI for testing/demo (not the product)

### Out of Scope (Phase 1)
- Production mobile app or web app (clients are third-party concern)
- Voice input processing (agents can handle speech-to-text upstream)
- Email forwarding / parsing
- Calendar sync (read or write)
- Multi-user / family sharing (multi-tenant yes, shared accounts no)
- Advanced analytics / spending insights
- On-device processing

---

## 12. Tech Considerations (To Be Decided)

| Decision | Options | Notes |
|---|---|---|
| LLM for NLU | Claude API, GPT-4, open-source | Need strong entity extraction + reasoning |
| OCR / Document AI | Claude Vision, Google Document AI, AWS Textract | Invoice/receipt parsing |
| Knowledge retrieval | RAG over stored manuals | For how-to Q&A |
| Storage | PostgreSQL + vector DB (pgvector) | Structured data + semantic search |
| MCP Server framework | Python MCP SDK, TypeScript MCP SDK | First-class agent integration |
| API framework | Python/FastAPI, Node.js/Express, Go/Gin | REST API layer |
| Webhook delivery | Custom (with retry), Svix, Hookdeck | Reliable event delivery |
| Background jobs | Celery, BullMQ, Temporal | Reminder scheduling, doc processing |
| Auth | Auth0, Clerk, custom JWT | Multi-tenant API auth |
| Deployment | Docker + K8s, serverless (Lambda/Cloud Run) | Needs always-on for reminders |

---

## 13. Open Questions

1. **Multi-user support** — Should a family share one account or have linked accounts?
2. **Proactive suggestions** — How proactive should the system be? (e.g., "You haven't mentioned Nano's vet checkup in 11 months — is he due?")
3. **Monetization** — Freemium (limited entities/reminders)? Subscription? One-time purchase? API usage-based?
4. **Offline capability** — Should core features work without internet?
5. **Data portability** — What export formats should be supported?
6. **Conflicting information** — How should the system handle contradictions? ("Nano gets groomed monthly" vs. later "Nano gets groomed every 6 weeks")
7. **Sensitive data handling** — Special treatment for medical/financial data?
8. **Integration ecosystem** — Priority integrations (Google Calendar, Apple Health, vet portals)?
9. **Agent trust levels** — Should different agents have different permission tiers? (e.g., health agent can read medical data but shopping agent cannot)
10. **Rate limiting strategy** — Per-user? Per-agent? Per-API-key? Tiered?
11. **MCP vs REST priority** — Should some features be MCP-only or REST-only, or full parity?
12. **Event sourcing** — Should we store all inputs as an immutable log (audit trail, conflict resolution)?

---

## 13. Success Metrics

| Metric | Target |
|---|---|
| Reminder accuracy (right time, right context) | > 95% |
| Information extraction accuracy | > 90% |
| User retention (30-day) | > 60% |
| Reminders acted upon (not dismissed) | > 70% |
| Time from input to structured capture | < 3 seconds |
| User satisfaction (NPS) | > 50 |

---

*This is a living document. To be refined through user research, prototyping, and iterative feedback.*
