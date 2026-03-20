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

## 5. Input Modalities

| Modality | Priority | Notes |
|---|---|---|
| Text chat | P0 (MVP) | Primary interface |
| Photo upload (invoices, receipts, prescriptions) | P0 (MVP) | Core document capture |
| PDF upload | P0 (MVP) | Digital invoices and manuals |
| Voice input | P1 | Transcribed to text, then processed |
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

## 10. MVP Scope (Phase 1)

**Goal:** Validate core value proposition with minimal feature set.

### In Scope
1. **Text-based conversational capture** — extract entities, events, recurrence from natural language
2. **Photo/PDF invoice upload** — OCR + structured data extraction
3. **Auto-reminders** — generate reminders with sensible defaults from captured data
4. **Push notifications** — deliver reminders via mobile push
5. **Basic Q&A** — query stored life data ("when did I last...", "how much did I spend on...")
6. **Manual lookup** — find and store product manuals for purchased items

### Out of Scope (Phase 1)
- Voice input
- Email forwarding / parsing
- Calendar sync (read or write)
- Multi-user / family sharing
- Advanced analytics / spending insights
- On-device processing
- Third-party integrations

---

## 11. Tech Considerations (To Be Decided)

| Decision | Options | Notes |
|---|---|---|
| LLM for NLU | Claude API, GPT-4, open-source | Need strong entity extraction + reasoning |
| OCR / Document AI | Google Document AI, AWS Textract, Claude Vision | Invoice/receipt parsing |
| Knowledge retrieval | RAG over stored manuals | For how-to Q&A |
| Storage | PostgreSQL + vector DB | Structured data + semantic search |
| Notification service | Firebase Cloud Messaging, AWS SNS | Reliable push delivery |
| Mobile platform | React Native, Flutter, Native | Cross-platform needed |
| Backend | Python/FastAPI, Node.js, Go | API layer |

---

## 12. Open Questions

1. **Multi-user support** — Should a family share one account or have linked accounts?
2. **Proactive suggestions** — How proactive should the system be? (e.g., "You haven't mentioned Nano's vet checkup in 11 months — is he due?")
3. **Monetization** — Freemium (limited entities/reminders)? Subscription? One-time purchase?
4. **Offline capability** — Should core features work without internet?
5. **Data portability** — What export formats should be supported?
6. **Conflicting information** — How should the system handle contradictions? ("Nano gets groomed monthly" vs. later "Nano gets groomed every 6 weeks")
7. **Sensitive data handling** — Special treatment for medical/financial data?
8. **Integration ecosystem** — Priority integrations (Google Calendar, Apple Health, vet portals)?

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
