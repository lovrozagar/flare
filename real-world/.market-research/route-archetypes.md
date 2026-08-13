last updated: 2026-03-06

# Route Archetypes for CLI Code Generator

## Executive Summary

- Web apps converge on ~12 distinct page types, but **6 archetypes cover ~80% of all routes** in real SaaS applications
- Every major framework (Rails, Django, Laravel/Filament, Blitz.js, RedwoodJS, Refine) generates the same core CRUD pages: **List, Detail/Show, Create, Edit** + mutations/queries
- Real SaaS apps split into 3-4 layout zones: **(marketing)**, **(auth)**, **(dashboard)**, **(docs)** -- confirmed across shadcn/taxonomy, MakerKit, ixartz/SaaS-Boilerplate, Kiranism/next-shadcn-dashboard-starter
- The "12 Standard Screen Patterns" (from Designing Web Interfaces) map precisely to route archetypes: Master/Detail, Forms, Dashboard, Spreadsheet/Table, Wizard, Filter Dataset
- Rendering strategy correlates tightly with page type: marketing=SSG/ISR, auth=SSR, dashboard=SSR+CSR hybrid, blog=SSG+ISR, settings=SSR

---

## Part 1: The 10 Most Common Page Types in Web Apps

### 1. List Page (Master List / Data Table)
**What it is:** Paginated table or grid of resources. The single most common page in any data-driven app.

**Data pattern:**
- Loads: Paginated collection query with filters, search, sort. Typical: `GET /resources?page=1&limit=20&sort=created_at&filter[status]=active`
- Auth: Almost always required (except public listings like product catalogs)
- Caching: SSR with short TTL for authenticated lists; ISR for public catalog pages
- Error states: Empty state ("No items yet"), loading skeleton, permission denied (403), server error (500)
- CRUD: Read (primary), Delete (bulk action), navigation to Create/Edit

**Framework evidence:**
- Rails scaffold: `index` action, renders collection
- Django: `ListView` class-based view
- Laravel/Filament: `ListRecords` page with table, filters, bulk actions
- Blitz.js: `pages/resources/index.tsx` with `getProjects` query
- Refine: `list` resource page with `useTable()` hook
- RedwoodJS: scaffold creates `ResourcesPage` + `ResourcesCell` (Loading/Empty/Failure/Success)

### 2. Detail Page (Show / View)
**What it is:** Single resource display with all fields, related data, and action buttons.

**Data pattern:**
- Loads: Single resource by ID with relations. `GET /resources/:id` with nested includes
- Auth: Usually required, often with ownership/role check
- Caching: SSR for authenticated; ISR for public content (blog posts, product pages)
- Error states: Not found (404), permission denied (403), loading skeleton
- CRUD: Read (primary), links to Edit, Delete confirmation

**Framework evidence:**
- Rails: `show` action, `GET /resources/:id`
- Django: `DetailView`, URL pattern `/resource/<int:pk>/`
- Filament: Optional `ViewRecord` page (read-only form)
- Blitz.js: `pages/resources/[resourceId].tsx` with `getProject` query
- Refine: `show` resource page

### 3. Create Page (New / Add Form)
**What it is:** Form for creating a new resource.

**Data pattern:**
- Loads: Empty form schema, may load related data for dropdowns/selects (categories, teams, etc.)
- Auth: Always required
- Caching: SSR (needs fresh related data for form options)
- Error states: Validation errors (field-level), submission error (500), permission denied (403)
- CRUD: Create (primary)

**Framework evidence:**
- Rails: `new` + `create` actions, `GET /resources/new` + `POST /resources`
- Django: `CreateView` with form
- Filament: `CreateRecord` page with form schema
- Blitz.js: `pages/resources/new.tsx` + `createProject` mutation + `ProjectForm` component
- Refine: `create` resource page with `useForm()`

### 4. Edit Page (Update Form)
**What it is:** Pre-populated form for modifying an existing resource.

**Data pattern:**
- Loads: Existing resource data + related data for dropdowns
- Auth: Always required, typically ownership/admin check
- Caching: SSR (must show latest data)
- Error states: Not found (404), validation errors, stale data conflict (409), permission denied (403)
- CRUD: Update (primary), sometimes Delete button

**Framework evidence:**
- Rails: `edit` + `update` actions, `GET /resources/:id/edit` + `PATCH /resources/:id`
- Django: `UpdateView`
- Filament: `EditRecord` page with pre-populated form
- Blitz.js: `pages/resources/[resourceId]/edit.tsx` + `updateProject` mutation
- Refine: `edit` resource page

### 5. Dashboard / Overview Page
**What it is:** Aggregated metrics, charts, recent activity, quick actions. First page after login.

**Data pattern:**
- Loads: Multiple aggregation queries (counts, sums, trends), recent items, notifications
- Auth: Always required
- Caching: SSR for layout + CSR for real-time widgets; ISR possible for summary widgets updated periodically
- Error states: Partial failure (some widgets fail, others render), empty state for new accounts
- CRUD: Read only (aggregations), navigation to detail pages

**Screen pattern:** Maps to "Dashboard" from 12 Standard Screen Patterns -- key info at a glance, real-time data, clear exploration entry points.

### 6. Settings Page (User/Org Configuration)
**What it is:** Tabbed or sidebar-nav form for updating preferences, profile, security, notifications, team settings.

**Data pattern:**
- Loads: Current user/org settings, plan info, team members
- Auth: Always required, often role-gated (org settings = admin only)
- Caching: SSR (must show current values)
- Error states: Validation errors, permission denied for restricted tabs, save confirmation
- CRUD: Read + Update (primary)

**Sub-pages typically include:**
- Profile (name, avatar, email)
- Security (password, 2FA, sessions)
- Notifications (email preferences, webhooks)
- Billing (current plan, payment method, invoices)
- Team/Members (invite, roles, remove)
- API Keys / Integrations

### 7. Auth Pages (Login, Signup, Password Reset)
**What it is:** Authentication flow pages. Not a single page but a family.

**Data pattern:**
- Loads: Minimal (maybe org branding for SSO)
- Auth: Explicitly NOT required (redirect to dashboard if already authenticated)
- Caching: SSG for form shells; SSR for SSO/SAML flows
- Error states: Invalid credentials, rate limiting, account locked, email not verified
- CRUD: Create (signup), Read (verify session), Update (reset password)

**Pages in family:**
- `/login` -- email/password + social buttons
- `/signup` -- registration form + plan selection
- `/forgot-password` -- email input
- `/reset-password` -- new password form (token-gated)
- `/verify-email` -- confirmation page
- `/sso/[provider]` -- SSO callback

### 8. Marketing / Landing Page
**What it is:** Public-facing pages: homepage, features, pricing, about, blog.

**Data pattern:**
- Loads: CMS content, pricing plans, testimonials, blog posts
- Auth: Not required
- Caching: SSG (primary), ISR for content updates. Blog index = ISR, blog post = SSG+ISR
- Error states: 404 for missing pages, minimal error handling
- CRUD: Read only

**Typical pages:**
- `/` -- Hero + features + social proof + CTA
- `/pricing` -- Plan comparison table
- `/features` -- Feature detail pages
- `/blog` -- Post list + individual posts
- `/docs` -- Documentation (often separate system)
- `/about`, `/contact`, `/legal/*`

### 9. Wizard / Multi-Step Form
**What it is:** Multi-step flow for complex creation or onboarding.

**Data pattern:**
- Loads: Progressive -- each step may load different data
- Auth: Usually required (onboarding) or not (public signup wizard)
- Caching: SSR per step
- Error states: Per-step validation, ability to go back, save draft
- CRUD: Create (primary, committed at final step)

**Common uses:**
- Onboarding flow (profile > team > invite > preferences)
- Complex resource creation (project setup wizard)
- Checkout flow

### 10. Empty / Error / Utility Pages
**What it is:** Boundary pages that handle edge cases.

**Pages:**
- `/404` -- Not found (SSG)
- `/403` -- Forbidden
- `/500` -- Server error
- Empty states within other pages (first-use experience)
- Maintenance page

---

## Part 2: Data Patterns Per Page Type

| Page Type | Primary Data | Auth Required | Rendering | Cache Strategy | Primary CRUD | Error States |
|-----------|-------------|---------------|-----------|---------------|--------------|-------------|
| List | Collection query, paginated, filtered | Yes (usually) | SSR | Short TTL / no-cache authenticated | Read + Delete | Empty, 403, 500 |
| Detail | Single resource + relations | Yes (usually) | SSR or ISR (public) | no-cache (auth) / ISR (public) | Read | 404, 403, 500 |
| Create | Empty form + related data for selects | Yes | SSR | no-cache | Create | Validation, 403 |
| Edit | Existing resource + related data | Yes | SSR | no-cache | Update | 404, Validation, 409, 403 |
| Dashboard | Multiple aggregations, recent items | Yes | SSR + CSR hybrid | Per-widget caching | Read | Partial failure, empty |
| Settings | User/org config, plan, team | Yes + role check | SSR | no-cache | Read + Update | Validation, 403 per tab |
| Auth | Minimal (branding) | No (redirect if auth'd) | SSG shell + SSR logic | SSG | Create/Update | Invalid creds, rate limit |
| Marketing | CMS content, pricing | No | SSG / ISR | Long TTL, ISR | Read | 404 |
| Wizard | Progressive per step | Varies | SSR | no-cache | Create | Per-step validation |
| Error/Utility | None or diagnostic data | No | SSG | Immutable | None | Self-documenting |

---

## Part 3: Layout Patterns

### Evidence from Real Apps

**shadcn/taxonomy** (Next.js 13 reference app):
```
app/
  (auth)/          -- Centered card layout, no sidebar
  (dashboard)/     -- Sidebar + header + content area
  (docs)/          -- Sidebar nav + content + TOC
  (editor)/        -- Full-width editor layout
  (marketing)/     -- Header + footer, full-width sections
```

**MakerKit** (Next.js SaaS Kit):
```
app/
  (site)/          -- Marketing layout (header + footer)
  auth/            -- Auth layout (centered)
  (app)/
    dashboard/     -- App layout (sidebar + content)
    dashboard/[organization]/  -- Org-scoped routes
```

**ixartz/SaaS-Boilerplate:**
```
app/
  Landing page, auth pages (public layout)
  Dashboard (authenticated layout with sidebar)
  Organization management (nested under dashboard)
```

**Kiranism/next-shadcn-dashboard-starter:**
```
app/
  (auth)/(signin)/    -- Auth layout
  (dashboard)/        -- Dashboard layout with sidebar
    /dashboard        -- Overview
    /dashboard/product    -- Data table
    /dashboard/profile    -- User settings
    /dashboard/kanban     -- Task board
    /dashboard/billing    -- Subscription management
```

### 5 Core Layout Patterns

1. **Marketing Layout** -- Header with nav links + footer. Full-width content. No sidebar. Public.
   - Used by: Landing, pricing, features, blog, docs, about, legal

2. **Auth Layout** -- Centered card on background. Minimal chrome. No nav. Redirects if authenticated.
   - Used by: Login, signup, forgot-password, reset-password, verify-email

3. **Dashboard Layout** -- Persistent sidebar (collapsible) + top header + main content area. Authenticated.
   - Used by: Dashboard overview, resource lists, resource detail, resource forms, kanban, analytics

4. **Settings Layout** -- Sidebar or tab navigation within the dashboard layout. Nested layout.
   - Used by: Profile, security, billing, team, notifications, API keys, integrations

5. **Docs Layout** -- Sidebar navigation + content area + optional table of contents. Can be public or auth'd.
   - Used by: Documentation, help center, knowledge base, changelog

### Advanced Patterns

6. **Modal Routes / Intercepting Routes** -- Content renders in modal overlay when navigated from within app, but as standalone page when accessed directly (URL is shareable). Next.js supports this via parallel + intercepting routes.
   - Used by: Photo galleries (Instagram-like), quick-edit modals, preview panels

7. **Wizard Layout** -- Step indicator + content area. May or may not have sidebar. Usually auth'd.
   - Used by: Onboarding, complex resource creation, checkout

---

## Part 4: What Do the Gold-Standard Generators Create?

### Rails `scaffold` (the original)

Command: `rails generate scaffold Post title:string body:text published:boolean`

**Generates per resource:**
| File | Purpose |
|------|---------|
| `db/migrate/xxx_create_posts.rb` | Database migration |
| `app/models/post.rb` | Model (validations, relations) |
| `app/controllers/posts_controller.rb` | Controller with 7 RESTful actions |
| `app/views/posts/index.html.erb` | List page |
| `app/views/posts/show.html.erb` | Detail page |
| `app/views/posts/new.html.erb` | Create page wrapper |
| `app/views/posts/edit.html.erb` | Edit page wrapper |
| `app/views/posts/_form.html.erb` | Shared form partial (used by new + edit) |
| `app/views/posts/_post.html.erb` | Single post partial (used in list) |
| `app/views/posts/index.json.jbuilder` | JSON list response |
| `app/views/posts/show.json.jbuilder` | JSON detail response |
| `config/routes.rb` | `resources :posts` (all 7 RESTful routes) |
| `test/models/post_test.rb` | Model tests |
| `test/controllers/posts_controller_test.rb` | Controller tests |
| `test/system/posts_test.rb` | System/integration tests |
| `test/fixtures/posts.yml` | Test fixtures |
| `app/helpers/posts_helper.rb` | View helper |

**7 RESTful routes:**
| HTTP | Path | Action | Purpose |
|------|------|--------|---------|
| GET | /posts | index | List all |
| GET | /posts/new | new | Show create form |
| POST | /posts | create | Submit create form |
| GET | /posts/:id | show | Show detail |
| GET | /posts/:id/edit | edit | Show edit form |
| PATCH/PUT | /posts/:id | update | Submit edit form |
| DELETE | /posts/:id | destroy | Delete resource |

### Django Class-Based Views

**5 standard views per resource:**
| View Class | URL Pattern | Purpose |
|-----------|-------------|---------|
| `ListView` | `/posts/` | Paginated list |
| `DetailView` | `/posts/<pk>/` | Single resource |
| `CreateView` | `/posts/create/` | Create form |
| `UpdateView` | `/posts/<pk>/edit/` | Edit form |
| `DeleteView` | `/posts/<pk>/delete/` | Delete confirmation |

### Laravel Filament

Command: `php artisan make:filament-resource Customer`

**Generates per resource:**
| File | Purpose |
|------|---------|
| `CustomerResource.php` | Resource class (form schema + table definition) |
| `ListCustomers.php` | List page with table, filters, bulk actions |
| `CreateCustomer.php` | Create form page |
| `EditCustomer.php` | Edit form page |
| `ViewCustomer.php` | (optional, with --view flag) Read-only detail |

With `--simple` flag: generates single "Manage" page with modal forms instead of separate pages.

### Blitz.js

Command: `blitz generate all project name:string`

**Generates per resource:**
| File | Purpose |
|------|---------|
| `pages/projects/index.tsx` | List page |
| `pages/projects/new.tsx` | Create page |
| `pages/projects/[projectId].tsx` | Detail/show page |
| `pages/projects/[projectId]/edit.tsx` | Edit page |
| `projects/components/ProjectForm.tsx` | Shared form component |
| `projects/queries/getProject.ts` | Single resource query |
| `projects/queries/getProjects.ts` | Collection query |
| `projects/mutations/createProject.ts` | Create mutation |
| `projects/mutations/updateProject.ts` | Update mutation |
| `projects/mutations/deleteProject.ts` | Delete mutation |

### RedwoodJS

Command: `yarn rw generate scaffold post`

**Generates per resource:**
- Pages: `PostsPage`, `PostPage`, `NewPostPage`, `EditPostPage`
- Cells: `PostsCell`, `PostCell`, `EditPostCell`, `NewPostCell` (each with Loading/Empty/Failure/Success states)
- Components: `Posts` (list table), `Post` (detail), `PostForm` (shared form)
- SDL: GraphQL schema definition
- Service: Database queries + mutations

### Refine

**4 standard page types per resource:**
| Page Type | URL Pattern | Hook Used |
|-----------|------------|-----------|
| `list` | `/resources` | `useTable()`, `useSimpleList()` |
| `create` | `/resources/create` | `useForm()` |
| `edit` | `/resources/:id/edit` | `useForm()` |
| `show` | `/resources/:id` | `useShow()` |

### Wasp

**Generates backend only per entity:**
- `getAll` query -- returns all entities
- `get` query -- returns one by ID
- `create` action -- creates new entity
- `update` action -- updates existing entity
- `delete` action -- deletes entity
- TypeScript types for full-stack type safety
- Client hooks: `Tasks.getAll.useQuery()`, `Tasks.create.useAction()`

Pages/UI must be built manually.

### Consensus: What Every Generator Creates

| Component | Rails | Django | Filament | Blitz | Redwood | Refine |
|-----------|-------|--------|----------|-------|---------|--------|
| List page | Yes | Yes | Yes | Yes | Yes | Yes |
| Detail/Show page | Yes | Yes | Optional | Yes | Yes | Yes |
| Create page/form | Yes | Yes | Yes | Yes | Yes | Yes |
| Edit page/form | Yes | Yes | Yes | Yes | Yes | Yes |
| Delete action | Yes | Yes | Yes | Yes | Yes | Yes |
| Shared form | Yes | N/A | Yes (schema) | Yes | Yes | Yes (schema) |
| API/query layer | JSON views | Implicit | Implicit | Queries | Cells+SDL | Hooks |
| Tests | Yes | Manual | Manual | Manual | Manual | Manual |

---

## Part 5: What 6 Archetypes Cover 80% of Real App Routes?

Based on the convergence across all framework generators, real SaaS app structures, and the 12 Standard Screen Patterns, these 6 archetypes cover the vast majority of routes:

### Archetype 1: RESOURCE-LIST
**Covers:** Any paginated collection view. Data tables, card grids, kanban boards.
**Routes:** `GET /[resources]`
**Contains:** Table/grid component, search, filters, sort, pagination, bulk actions, link to create, link to detail
**Layout:** Dashboard
**Rendering:** SSR (authenticated) or ISR (public catalog)
**Real examples:** `/dashboard/users`, `/dashboard/products`, `/dashboard/orders`, `/posts`, `/projects`

### Archetype 2: RESOURCE-DETAIL
**Covers:** Single resource view with all data, related items, actions.
**Routes:** `GET /[resources]/[id]`
**Contains:** Field display, related data sections, action buttons (edit, delete, archive), breadcrumb
**Layout:** Dashboard
**Rendering:** SSR (authenticated) or ISR (public)
**Real examples:** `/dashboard/users/[id]`, `/dashboard/orders/[id]`, `/posts/[slug]`

### Archetype 3: RESOURCE-FORM (Create + Edit)
**Covers:** Both create and edit forms. One archetype, conditionally populated.
**Routes:** `GET /[resources]/new` (create), `GET /[resources]/[id]/edit` (edit)
**Contains:** Form fields, validation, submit action, cancel, delete (edit mode only)
**Layout:** Dashboard
**Rendering:** SSR
**Real examples:** `/dashboard/products/new`, `/dashboard/products/[id]/edit`, `/settings/profile`

### Archetype 4: DASHBOARD-OVERVIEW
**Covers:** Aggregated metrics, charts, recent activity, quick actions.
**Routes:** `GET /dashboard`
**Contains:** Stat cards, charts/graphs, recent activity feed, quick action buttons, notifications
**Layout:** Dashboard
**Rendering:** SSR + CSR hybrid (widgets refresh independently)
**Real examples:** `/dashboard`, `/analytics`, `/admin`

### Archetype 5: SETTINGS-PAGE
**Covers:** Tabbed/sectioned configuration with forms. User settings, org settings, billing.
**Routes:** `GET /settings/[section]`
**Contains:** Tab/sidebar navigation, form per section, save per section, role-gated tabs
**Layout:** Dashboard > Settings (nested)
**Rendering:** SSR
**Real examples:** `/settings/profile`, `/settings/billing`, `/settings/team`, `/settings/notifications`

### Archetype 6: MARKETING-PAGE
**Covers:** All public-facing content pages.
**Routes:** `GET /`, `GET /pricing`, `GET /features`, `GET /blog/[slug]`
**Contains:** Hero sections, feature grids, testimonials, CTAs, blog content, pricing tables
**Layout:** Marketing
**Rendering:** SSG + ISR
**Real examples:** `/`, `/pricing`, `/about`, `/blog`, `/docs`, `/changelog`

### What These 6 Cover in a Real SaaS App

```
/ .......................................... MARKETING-PAGE
/pricing ................................... MARKETING-PAGE
/features .................................. MARKETING-PAGE
/blog ...................................... MARKETING-PAGE (list variant)
/blog/[slug] ............................... MARKETING-PAGE (detail variant)
/login ..................................... (Auth -- special, see below)
/signup ..................................... (Auth -- special, see below)
/forgot-password ........................... (Auth -- special, see below)
/dashboard ................................. DASHBOARD-OVERVIEW
/dashboard/projects ........................ RESOURCE-LIST
/dashboard/projects/new .................... RESOURCE-FORM (create)
/dashboard/projects/[id] ................... RESOURCE-DETAIL
/dashboard/projects/[id]/edit .............. RESOURCE-FORM (edit)
/dashboard/customers ....................... RESOURCE-LIST
/dashboard/customers/[id] .................. RESOURCE-DETAIL
/dashboard/analytics ....................... DASHBOARD-OVERVIEW (variant)
/settings/profile .......................... SETTINGS-PAGE
/settings/security ......................... SETTINGS-PAGE
/settings/billing .......................... SETTINGS-PAGE
/settings/team ............................. SETTINGS-PAGE (with RESOURCE-LIST for members)
/settings/notifications .................... SETTINGS-PAGE
/admin/users ............................... RESOURCE-LIST
/admin/users/[id] .......................... RESOURCE-DETAIL
```

**Coverage:** These 6 archetypes cover approximately **80-85% of all routes** in a typical SaaS application. The remaining 15-20% includes auth pages (a special case, usually 4-5 static-ish pages), wizard/onboarding flows, and one-off utility pages.

### Bonus Archetype 7: AUTH-PAGE
If shipping a 7th, this covers the auth family:
**Routes:** `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`
**Contains:** Centered form card, social login buttons, links between auth pages
**Layout:** Auth (minimal, centered)
**Rendering:** SSG shell + SSR logic

---

## Part 6: Modern SaaS Route Structure (Complete Reference)

### Typical SaaS App Route Tree

Based on synthesis of shadcn/taxonomy, MakerKit, ixartz/SaaS-Boilerplate, Kiranism/dashboard-starter, SaaSykit, BoxyHQ/saas-starter-kit, and Vercel SaaS templates:

```
app/
  layout.tsx                          # Root layout (fonts, providers, theme)
  not-found.tsx                       # Global 404
  error.tsx                           # Global error boundary

  (marketing)/                        # Public marketing layout
    layout.tsx                        # Header + footer
    page.tsx                          # / -- Homepage / landing
    pricing/page.tsx                  # /pricing
    features/page.tsx                 # /features
    about/page.tsx                    # /about
    contact/page.tsx                  # /contact
    blog/
      page.tsx                        # /blog -- Blog index
      [slug]/page.tsx                 # /blog/[slug] -- Blog post
    docs/
      layout.tsx                      # Docs sidebar layout
      [...slug]/page.tsx              # /docs/[...slug] -- Doc pages
    legal/
      privacy/page.tsx                # /legal/privacy
      terms/page.tsx                  # /legal/terms

  (auth)/                             # Auth layout (centered, minimal)
    layout.tsx                        # Centered card layout
    login/page.tsx                    # /login
    signup/page.tsx                   # /signup
    forgot-password/page.tsx          # /forgot-password
    reset-password/page.tsx           # /reset-password
    verify-email/page.tsx             # /verify-email
    sso/[provider]/page.tsx           # /sso/[provider]

  (dashboard)/                        # Authenticated app layout
    layout.tsx                        # Sidebar + header + content
    dashboard/
      page.tsx                        # /dashboard -- Overview
      analytics/page.tsx              # /dashboard/analytics

      # -- Resource: Projects (example) --
      projects/
        page.tsx                      # /dashboard/projects -- List
        new/page.tsx                  # /dashboard/projects/new -- Create
        [id]/
          page.tsx                    # /dashboard/projects/[id] -- Detail
          edit/page.tsx               # /dashboard/projects/[id]/edit

      # -- Resource: Customers (example) --
      customers/
        page.tsx                      # /dashboard/customers
        [id]/page.tsx                 # /dashboard/customers/[id]

    settings/
      layout.tsx                      # Settings sidebar/tab layout
      profile/page.tsx                # /settings/profile
      security/page.tsx               # /settings/security
      billing/page.tsx                # /settings/billing
      team/
        page.tsx                      # /settings/team -- Member list
        invite/page.tsx               # /settings/team/invite
      notifications/page.tsx          # /settings/notifications
      api-keys/page.tsx               # /settings/api-keys
      integrations/page.tsx           # /settings/integrations

  (admin)/                            # Admin-only layout (optional)
    layout.tsx
    admin/
      page.tsx                        # /admin -- Admin dashboard
      users/
        page.tsx                      # /admin/users
        [id]/page.tsx                 # /admin/users/[id]
      orgs/page.tsx                   # /admin/orgs
      billing/page.tsx                # /admin/billing -- MRR/churn stats
      announcements/page.tsx          # /admin/announcements

  api/                                # API routes
    auth/[...nextauth]/route.ts       # Auth API
    webhooks/stripe/route.ts          # Stripe webhooks
    v1/[...slug]/route.ts             # Public API
```

### Layout Zone Summary

| Zone | Layout | Auth | Rendering | Example Routes |
|------|--------|------|-----------|----------------|
| Marketing | Header + footer, full-width | No | SSG / ISR | /, /pricing, /blog |
| Auth | Centered card, minimal | No (redirect if auth'd) | SSG + SSR | /login, /signup |
| Dashboard | Sidebar + header | Yes | SSR + CSR | /dashboard, /projects |
| Settings | Nested sidebar within dashboard | Yes + role | SSR | /settings/* |
| Admin | Separate sidebar or within dashboard | Yes + admin role | SSR | /admin/* |
| Docs | Sidebar nav + TOC | Optional | SSG / ISR | /docs/* |

---

## Part 7: Error States Per Archetype

| Archetype | Loading State | Empty State | 404 | 403 | 500 | Validation | Special |
|-----------|--------------|-------------|-----|-----|-----|------------|---------|
| List | Table skeleton | "No items yet" + CTA | N/A | "No access" | "Failed to load" | N/A | Filter returns 0 results |
| Detail | Content skeleton | N/A | "Not found" | "No access" | "Failed to load" | N/A | Resource deleted |
| Form | Form skeleton | N/A | "Not found" (edit) | "No access" | "Save failed" | Per-field errors | Stale data (409) |
| Dashboard | Widget skeletons | "Welcome! Set up..." | N/A | "No access" | Partial widget failure | N/A | First-time user |
| Settings | Form skeleton | Default values | N/A | Per-tab gating | "Save failed" | Per-field errors | Unsaved changes warning |
| Marketing | Content skeleton | N/A | "Page not found" | N/A | "Unavailable" | N/A | Preview mode |
| Auth | Minimal | N/A | N/A | N/A | "Login failed" | Per-field errors | Rate limiting, account locked |

---

## Part 8: Per-Archetype File Generation Spec

What a CLI generator should create per archetype, synthesizing patterns from Rails, Blitz, Redwood, Filament, and Refine:

### RESOURCE-LIST
```
routes/[resource]/
  page.tsx              # Route component (server component, data loading)
  -components/
    [resource]-table.tsx    # Table component with columns, actions
    [resource]-filters.tsx  # Search/filter bar
    columns.tsx             # Column definitions
```

### RESOURCE-DETAIL
```
routes/[resource]/[id]/
  page.tsx              # Route component (server component)
  -components/
    [resource]-detail.tsx   # Detail display component
    [resource]-actions.tsx  # Action buttons (edit, delete, archive)
```

### RESOURCE-FORM
```
routes/[resource]/new/
  page.tsx              # Create route
routes/[resource]/[id]/edit/
  page.tsx              # Edit route
-components/
  [resource]-form.tsx   # Shared form component (used by both create + edit)
-schema/
  [resource].ts         # Zod validation schema
-actions/
  [resource]-actions.ts # Server actions (create, update, delete mutations)
-queries/
  [resource]-queries.ts # Data loading (getOne, getMany)
```

### DASHBOARD-OVERVIEW
```
routes/dashboard/
  page.tsx              # Dashboard route
  -components/
    stat-cards.tsx      # KPI cards
    recent-activity.tsx # Activity feed
    charts.tsx          # Chart widgets
```

### SETTINGS-PAGE
```
routes/settings/
  layout.tsx            # Settings layout with sidebar/tabs
  [section]/
    page.tsx            # Section route
    -components/
      [section]-form.tsx # Settings form for this section
```

### MARKETING-PAGE
```
routes/(marketing)/
  layout.tsx            # Marketing layout
  page.tsx              # Landing page
  pricing/page.tsx      # Pricing page
  -components/
    hero.tsx
    features.tsx
    pricing-table.tsx
    testimonials.tsx
    cta.tsx
```

### AUTH-PAGE
```
routes/(auth)/
  layout.tsx            # Auth layout (centered card)
  login/page.tsx
  signup/page.tsx
  forgot-password/page.tsx
  -components/
    auth-form.tsx       # Shared auth form component
    social-buttons.tsx  # OAuth provider buttons
```

---

## Verdict

**If you can only ship 5-6 archetypes, ship these:**

1. **resource-list** -- The most common page in any data app
2. **resource-form** -- Combined create + edit (shared form, conditional data loading)
3. **resource-detail** -- Show/view page
4. **dashboard** -- Overview/analytics page
5. **settings** -- Tabbed settings layout + forms
6. **marketing** -- Public landing/content pages

**Auth pages** should be either a 7th archetype or a separate auth scaffold command since they're a one-time generation, not per-resource.

**The critical insight:** resource-list + resource-form + resource-detail map to the 7 RESTful routes that every framework since Rails has standardized on. Dashboard, settings, and marketing are the 3 layout-level archetypes that complete the picture. Together, these 6 cover the ~35-50 routes a typical SaaS app has.

---

## Sources

### Framework Generators
- [Rails Scaffold Generator](https://guides.rubyonrails.org/generators.html)
- [Rails Routing - 7 RESTful Actions](https://guides.rubyonrails.org/routing.html)
- [Rails Scaffolding Explained - RubyGuides](https://www.rubyguides.com/2020/03/rails-scaffolding/)
- [Django Class-Based Views - MDN](https://developer.mozilla.org/en-US/docs/Learn/Server-side/Django/Generic_views)
- [Django CRUD Views](https://rayed.com/posts/2018/05/django-crud-create-retrieve-update-delete/)
- [Laravel Filament Resource Generator](https://filamentphp.com/docs/3.x/panels/resources/getting-started)
- [Blitz.js CLI Generate](https://blitzjs.com/docs/cli-generate)
- [RedwoodJS Cells](https://redwoodjs.com/docs/tutorial/chapter2/cells)
- [Refine CRUD Framework](https://github.com/refinedev/refine)
- [Refine Adding CRUD Pages](https://refine.dev/blog/refine-react-invoice-generator-3/)
- [Wasp Automatic CRUD](https://wasp.sh/docs/data-model/crud)

### SaaS App Structures
- [shadcn/taxonomy - Route Groups](https://github.com/shadcn-ui/taxonomy)
- [MakerKit Architecture](https://makerkit.dev/docs/next-supabase/architecture/architecture)
- [ixartz/SaaS-Boilerplate](https://github.com/ixartz/SaaS-Boilerplate)
- [Kiranism/next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter)
- [BoxyHQ SaaS Starter Kit](https://github.com/boxyhq/saas-starter-kit)
- [Next.js Official SaaS Starter](https://github.com/nextjs/saas-starter)
- [Indiesaas - Next.js SaaS Starter](https://github.com/indieceo/Indiesaas)
- [SaaSykit - Laravel SaaS Starter](https://saasykit.com)
- [SaaS Pegasus - Django SaaS Boilerplate](https://www.saaspegasus.com/)
- [Startino SvelteKit SaaS Starter](https://github.com/startino/saas-starter)

### Route and Layout Patterns
- [Next.js Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups)
- [Next.js Parallel Routes](https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes)
- [Next.js Intercepting Routes](https://nextjs.org/docs/app/api-reference/file-conventions/intercepting-routes)
- [Next.js Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages)
- [Remix Route Configuration](https://remix.run/docs/en/main/discussion/routes)
- [Remix Flat Routes](https://blog.logrocket.com/remix-flat-routes-evolution-routing/)
- [Next.js App Router Project Structure Guide](https://makerkit.dev/blog/tutorials/nextjs-app-router-project-structure)

### Rendering and Caching
- [Vercel: How to Choose Rendering Strategy](https://vercel.com/blog/how-to-choose-the-best-rendering-strategy-for-your-app)
- [Vercel: ISR for Dynamic Content](https://vercel.com/blog/isr-a-flexible-way-to-cache-dynamic-content)
- [SSR, SSG, ISR, CSR Comparison](https://www.ramotion.com/blog/web-rendering-types-comparison/)
- [When to Use SSR, SSG, or ISR in Next.js](https://bitskingdom.com/blog/nextjs-when-to-use-ssr-vs-ssg-vs-isr/)
- [Lewis C. Lin: SSR, SSG, ISR, CSR Examples](https://www.lewis-lin.com/blog/front-end-system-design-understanding-ssr-ssg-isr-csr)

### Screen Patterns and Design
- [12 Standard Screen Patterns](http://designingwebinterfaces.com/designing-web-interfaces-12-screen-patterns)
- [60 SaaS Screen Design Examples - Eleken](https://www.eleken.co/blog-posts/screen-design-examples)
- [SaaS Sitemap Examples - MockFlow](https://mockflow.com/sitemap-examples/saas-website-sitemap-example-1)
- [SaaS Layout Structure Best Practices](https://medium.com/design-bootcamp/designing-a-layout-structure-for-saas-products-best-practices-d370211fb0d1)
- [Loading, Error, Empty States Pattern](https://design-system.agriculture.gov.au/patterns/loading-error-empty-states)
- [Error Page Design Guide](https://thestory.is/en/journal/custom-error-page-design/)

### Auth Patterns
- [WorkOS: Next.js Authentication Guide 2026](https://workos.com/blog/nextjs-app-router-authentication-guide-2026)
- [Login and Signup UX Guide 2025](https://www.authgear.com/post/login-signup-ux-guide)
- [Sign-In User Flows - SaaS Websites](https://saaswebsites.com/userflow-articles/sign-in-user-flows-and-password-reset-tips-inspiration-and-examples/)
