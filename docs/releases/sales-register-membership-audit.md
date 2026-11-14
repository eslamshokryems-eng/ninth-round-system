# register_membership audit & conversion fix

Date: 2026-11-14 · Production project `yjuzjvlmyszutuqpwenn` was inspected **read-only** (catalog queries and one `EXPLAIN` that resolves but never executes a function). Nothing in Production was changed.

## 1. What Production holds
| Function | Signature | Differences |
|---|---|---|
| `register_membership` (A) | 20 args: `p_branch_id uuid, p_full_name, p_phone, p_gender, p_date_of_birth, p_national_id, p_membership_type_id, p_receipt_number, p_price, p_discount, p_start_date, p_payment_method, p_notes, p_address=null, p_emergency_contact_name=null, p_emergency_contact_phone=null, p_photo_url=null, p_coach_id=null, p_session_count=null, p_program_type=null` | inserts member + membership + payment and writes `create_membership` audit; **does not set `memberships.sold_by`** |
| `register_membership` (B) | the same 20 + `p_sold_by uuid = null` (21 args) | identical body **plus** `sold_by = p_sold_by` |
| `convert_lead_to_member` | 16 args | calls `register_membership(...)` with **19 positional** arguments |

Both versions are `SECURITY INVOKER`, without a pinned `search_path`. Both are executable by PUBLIC, anon, authenticated and service_role. The same duplication exists for `renew_membership` (10/11 args) and `sell_additional_membership` (2 overloads).

**Why there are two.** Repo migration `20260917000001_membership_sold_by.sql` drops version A and creates B. It does **not** appear in Production's migration history, yet B exists in Production. So the `sold_by` change was applied outside the migration flow, without the `drop function`. Other repo migrations are also missing from Production's history although their objects exist (for example `delete_receipt`). The Production schema has drifted from the repository.

## 2. Which version is called, and the HTTP 400s
* **Reception (Add Member, Renew, Sell additional)** passes `p_sold_by` **by name** through PostgREST. Only B has that parameter, so these calls resolve to exactly one function and work.
* **Lead conversion** (`convert_lead_to_member`) calls with 19 positional arguments. Both A (20, last one defaulted) and B (21, last two defaulted) accept that, so PostgreSQL cannot choose:
  `ERROR 42725: function public.register_membership(uuid, text, …, uuid, integer) is not unique`.
  This was confirmed on Production with `EXPLAIN` (the call is resolved, not executed). PostgREST returns it as **HTTP 400**, matching the `rpc/convert_lead_to_member` 400s in Production's logs. **Every lead conversion in Production currently fails.**
* Even without the ambiguity, the old conversion never set `sold_by`, so the lead owner would not have been credited.

## 3. Are both versions necessary?
No. B is a strict superset of A: same body, plus `sold_by`, and `p_sold_by` defaults to NULL. Every call that A can serve, B serves identically.

## 4. Resolution chosen: backward compatible, nothing dropped
Dropping A in Production is a destructive change to a function that reception relies on (indirectly). The release does **not** need it:
* the new `convert_lead()` calls `register_membership` with **named arguments including `p_sold_by`**. Only B matches, so the call is unambiguous whether or not A still exists;
* `convert_lead_to_member` keeps its exact signature and result shape and now delegates to `convert_lead()`, so any old client works too.

Tested locally **on Production's shape**: the repo schema plus Production's exact leftover version A (`supabase/tests/sales_crm/prodshape_overload.sql`).
* `V00`: two overloads present.
* `V00b`: the old positional call fails with `42725 … is not unique`, reproducing the Production bug.
* `V01`–`V05`, `V24`: conversions succeed through both entry points with `sold_by` = lead owner.

**Optional later clean-up**, not part of this release, needs its own approval: `drop function public.register_membership(uuid,text,text,gender,date,text,uuid,text,numeric,numeric,date,membership_payment_method,text,text,text,text,text,uuid,integer,program_type);` and the same for the 10-argument `renew_membership` and the older `sell_additional_membership`. Before running it, verify that no external caller (mobile app build, scripts) uses positional calls.

## 5. Attribution (unchanged meanings, enforced)
| Field | Set to on conversion | Verified by |
|---|---|---|
| `memberships.sold_by` | the **lead owner** (`leads.assigned_to` at the moment of conversion) | V02, V05, browser G11, H3 |
| `memberships.created_by` | the signed-in employee who converts (set by `register_membership`) | V02, V05, G11, H3 |
| `membership_payments.received_by` | the signed-in employee who converts (set by `register_membership`) | V02, V05, G11, H3 |
| `leads.assigned_to` | unchanged | — |

A lead with no owner cannot be converted until a manager assigns it (V12, H1), so there is always someone to credit. A lead whose owner was deactivated must be reassigned first (V13). Nobody is silently credited.
