# Property Listings System — Design Spec

## Problem

Real estate agents need to:
1. **Show properties** to WhatsApp leads — with photos, price, and details.
2. **Match customer criteria** (budget, area, type) to available listings.
3. **Let the AI send relevant listings** during conversation, with images.
4. **Manage listings** from the dashboard (add, edit, upload photos, mark sold).

Currently the AI can qualify leads and book viewings, but it has **no inventory to show**.

---

## Proposed Architecture

```
Agent uploads listing + photos
        |
        v
  Dashboard UI ──► POST /api/properties ──► properties table
        |                                        |
        └── Upload images ──► Supabase Storage   |
                (public bucket)                  |
                                                 |
Customer: "Show me 2BR in Dubai Marina"          |
        |                                        |
        v                                        v
  AI calls search_properties tool ──► Query properties table
        |                                  (filter by criteria)
        v
  AI sends WhatsApp message with:
    - Property details text
    - Photo URLs via Twilio mediaUrl
```

---

## 1. Database

### `properties` table

```sql
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

  -- Basic info
  title TEXT NOT NULL,                    -- "Luxury 2BR Apartment in Marina"
  description TEXT,                       -- Full description
  property_type TEXT NOT NULL,            -- apartment, villa, townhouse, office, land, studio
  listing_type TEXT DEFAULT 'sale',       -- sale, rent

  -- Location
  area TEXT,                              -- "Dubai Marina"
  city TEXT,                              -- "Dubai"
  address TEXT,                           -- Full address (optional)
  map_url TEXT,                           -- Google Maps link

  -- Pricing
  price DECIMAL(15,2),                    -- 1500000.00
  currency TEXT DEFAULT 'AED',
  price_label TEXT,                       -- "1.5M AED" or "8,500/month"

  -- Details
  bedrooms INTEGER,
  bathrooms INTEGER,
  area_sqft INTEGER,
  floor_number INTEGER,
  furnishing TEXT,                        -- furnished, semi-furnished, unfurnished
  amenities TEXT[],                       -- ['pool', 'gym', 'parking', 'balcony']

  -- Media
  images TEXT[] DEFAULT '{}',             -- Array of public URLs from Supabase Storage
  thumbnail_url TEXT,                     -- First/best image URL

  -- Status
  status TEXT DEFAULT 'available',        -- available, reserved, sold, rented, off-market
  featured BOOLEAN DEFAULT false,
  
  -- Tracking
  view_count INTEGER DEFAULT 0,          -- How many times AI sent this listing
  inquiry_count INTEGER DEFAULT 0,       -- How many leads asked about it
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_properties_tenant ON properties(tenant_id);
CREATE INDEX idx_properties_search ON properties(tenant_id, status, property_type, area);
CREATE INDEX idx_properties_price ON properties(tenant_id, price);
CREATE INDEX idx_properties_bedrooms ON properties(tenant_id, bedrooms);

-- RLS
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access to properties"
  ON properties FOR ALL USING (true) WITH CHECK (true);
```

### `property_inquiries` table (tracks which leads asked about which properties)

```sql
CREATE TABLE property_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  
  inquiry_type TEXT DEFAULT 'view',      -- view, info, price, other
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 2. Supabase Storage

### Bucket: `property-images`
- **Public** bucket (images need to be accessible via URL for Twilio)
- Path pattern: `{tenant_id}/{property_id}/{filename}`
- Accepted types: jpg, jpeg, png, webp
- Max file size: 5MB per image
- Max 10 images per property

### Image Upload Flow
1. Agent selects images in dashboard
2. Frontend uploads directly to Supabase Storage (client-side)
3. Public URL is returned
4. URL is added to `properties.images[]` array
5. First image becomes `thumbnail_url`

---

## 3. AI Tool: `search_properties`

### Tool Definition
```typescript
{
  name: 'search_properties',
  description: 'Search available property listings. Call this when a customer asks about properties, wants to see what is available, or describes what they are looking for.',
  parameters: {
    type: 'object',
    properties: {
      property_type: { type: 'string', description: 'apartment, villa, townhouse, studio, office, land' },
      listing_type: { type: 'string', enum: ['sale', 'rent'], description: 'Sale or rent' },
      area: { type: 'string', description: 'Neighborhood or area name' },
      min_price: { type: 'number', description: 'Minimum price' },
      max_price: { type: 'number', description: 'Maximum price' },
      bedrooms: { type: 'integer', description: 'Number of bedrooms' },
      furnishing: { type: 'string', description: 'furnished, semi-furnished, unfurnished' },
    },
    required: [],
  },
}
```

### Handler Logic
1. Query `properties` table with filters (all optional, ANDed together)
2. Filter: `status = 'available'`, `tenant_id` matches
3. Order by: `featured DESC, created_at DESC`
4. Limit: 5 results
5. Return: `{ success, properties: [{ title, price_label, bedrooms, area, thumbnail_url, id }], total_count }`

### AI Behavior After Search
The AI should:
1. Describe 2-3 best matches in short WhatsApp messages
2. Send the thumbnail image via `mediaUrl` for the top match
3. Ask: "Want me to send more photos or book a viewing?"
4. If customer says "more photos" → send remaining images
5. If customer says "book viewing" → proceed to `check_calendar` → `book_appointment`

### Sending Images via Twilio
```typescript
await sendWhatsAppMessage(tenantId, customerPhone, 
  "🏠 *Luxury 2BR in Dubai Marina*\n💰 1.5M AED | 1,200 sqft\n🛏 2 bed, 2 bath | Furnished\n\nWant to schedule a viewing?",
  { mediaUrl: [property.thumbnail_url] }
);
```

---

## 4. API Endpoints

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/properties` | GET | Session | List properties (with filters) |
| `/api/properties` | POST | Session | Create property |
| `/api/properties/[id]` | GET | Session | Get single property |
| `/api/properties/[id]` | PUT | Session | Update property |
| `/api/properties/[id]` | DELETE | Session | Delete property |
| `/api/properties/[id]/images` | POST | Session | Upload image(s) |
| `/api/properties/[id]/images` | DELETE | Session | Remove image |

### GET /api/properties Query Params
```
?type=apartment&area=marina&min_price=1000000&max_price=2000000&bedrooms=2&status=available&page=1&limit=20
```

---

## 5. Dashboard UI

### Properties List Page (`/dashboard/properties`)
- **Header**: "Property Listings" + "Add Property" button
- **Stats bar**: Total | Available | Sold | Rented
- **Filter bar**: Type dropdown, Area text input, Price range, Status filter
- **Grid/List toggle**: Card view (with thumbnail) or table view
- **Each card**: Thumbnail, title, price, bedrooms/area, status badge
- **Click → detail page**

### Add/Edit Property Page (`/dashboard/properties/[id]`)
- **Form sections**:
  - Basic: Title, description, property type, listing type
  - Location: Area, city, address, map URL
  - Pricing: Price, currency
  - Details: Bedrooms, bathrooms, sqft, floor, furnishing, amenities (multi-select)
  - Photos: Drag-and-drop upload zone, image preview grid, reorder, delete
  - Status: Available/Reserved/Sold/Off-market
- **Save** button → POST or PUT

### Photo Upload Component
- Drag-and-drop zone with preview
- Max 10 images, 5MB each
- Auto-generates thumbnail from first image
- Click to reorder, X to delete
- Uploads to Supabase Storage on drop (shows progress)

---

## 6. Updated AI Prompt (Real Estate)

```
INDUSTRY: Real Estate
YOUR ROLE: Property consultant for {{company_name}}.

QUALIFYING QUESTIONS (ask one at a time):
- What type of property? (apartment/villa/office/land)
- Buying or renting?
- Which area or neighborhood?
- What's your budget range?
- How many bedrooms?
- When are you looking to move/invest?

PROPERTY SEARCH FLOW:
1. Once you know at least type + area OR budget → call search_properties.
2. Present 2-3 best matches with key details (price, beds, area).
3. Send the thumbnail image of the top match.
4. Ask: "Want more photos, details, or to schedule a viewing?"
5. If they want a viewing → proceed to check_calendar → book_appointment.

NEVER say "I'll send you listings later" — search and show them NOW.
```

---

## 7. Implementation Order

1. **Migration**: Create `properties` + `property_inquiries` tables
2. **Supabase Storage**: Create `property-images` bucket
3. **API Routes**: CRUD for properties + image upload
4. **AI Tool**: `search_properties` handler + register in tool index
5. **AI Prompt**: Update real-estate industry context
6. **Dashboard UI**: Properties list page + add/edit form + photo upload
7. **Twilio Integration**: AI sends property images via `mediaUrl`
8. **Test**: Add property tests to test suite

### Estimated Effort
- **Steps 1-4**: ~1 session (backend + AI tool)
- **Steps 5-7**: ~1 session (UI + Twilio media)
- **Step 8**: Quick addition to existing test suite

---

## 8. Example Conversation

```
Customer: Hi, I'm looking for a 2-bedroom apartment in Dubai Marina

AI: Hey! 👋 Welcome to [Company]. I'd love to help you find the perfect 
    place in Dubai Marina! Are you looking to buy or rent?

Customer: Buy

AI: Great choice! What's your budget range for the purchase?

Customer: Around 1.5 million

AI: Perfect. By the way, what's your name?

Customer: Ahmed

AI: Nice to meet you, Ahmed! Let me check what we have available...
    [calls search_properties: type=apartment, area=Dubai Marina, max_price=1700000, bedrooms=2]

AI: I found 3 great options for you! Here's the top match:

    🏠 *Marina Vista Residences - 2BR*
    💰 1,450,000 AED
    📏 1,200 sqft | Furnished
    🏊 Pool, Gym, Parking
    
    [sends property photo]
    
    Want to see more options, or shall we schedule a viewing for this one?

Customer: This looks nice! Can I see it this week?

AI: Let me check available times...
    [calls check_calendar]

AI: I have these viewing slots this week:
    - Tuesday 2:00 PM
    - Wednesday 10:00 AM  
    - Thursday 4:00 PM
    
    Which works best for you, Ahmed?

Customer: Wednesday 10am

AI: [calls book_appointment]
    You're all set! Wednesday at 10:00 AM is confirmed for your viewing 
    at Marina Vista Residences. What's your email so I can send the details?

Customer: ahmed@email.com

AI: [calls update_lead with email]
    Perfect! Confirmation sent to ahmed@email.com. See you Wednesday! 🏠
```

---

## 9. Future Enhancements (Not in V1)
- AI auto-generates property descriptions from photos (vision API)
- Property comparison tool ("compare these 2 listings")
- Saved searches / alerts for new listings matching criteria
- Virtual tour links
- Property valuation estimates
- Multi-language listing descriptions (auto-translate)
