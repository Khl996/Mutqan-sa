# Demo Browser Checklist

Status: manual browser readiness checklist  
Scope: staging/demo tenant only  
Use with: `docs/demo/demo-tenant-health-check.md` and `docs/demo/demo-tenant-seed-plan.md`

## 1. Purpose

This checklist verifies the sales demo experience in the browser. Backend verification can prove authority and workflow safety, but it cannot prove that the demo looks credible, reads well, or moves at the right pace.

Complete this checklist after the automated pre-demo verification commands pass and before using the tenant in a sales conversation.

## 2. Pre-Check

- [ ] Confirm the environment is staging/demo, not production.
- [ ] Confirm the intended tenant is selected.
- [ ] Confirm no real customer names, contacts, addresses, photos, attachments, or internal notes are visible.
- [ ] Confirm the presenter has the main manager/admin account ready.
- [ ] Confirm backup records exist for each workflow stage.
- [ ] Confirm browser zoom is at a normal demo setting.
- [ ] Confirm the demo can run in the target language or language pair.

## 3. Dashboard

- [ ] Dashboard loads without errors or long blank states.
- [ ] Tenant name/context is clear.
- [ ] Work-order counts are plausible.
- [ ] PM, inventory, asset, or report widgets are not empty if shown.
- [ ] Cards and charts do not overlap on desktop.
- [ ] Mobile/tablet layout is acceptable if it will be shown.
- [ ] Empty states, if any, do not undermine the demo story.
- [ ] Presenter can move from dashboard to the main story quickly.

Pacing note:

- Do not spend more than 2 minutes here unless the audience is executive-only.

## 4. Work Order List

- [ ] List loads with visible records in multiple statuses.
- [ ] Status filters show `pending`, `assigned`, `in_progress`, approval/review states, `completed`, and `cancelled` where available.
- [ ] Priority, due date, location, asset, and assignee are readable.
- [ ] Main story work order is easy to find.
- [ ] PM-generated work order is distinguishable from corrective/reactive work.
- [ ] Overdue work is visually clear if the list supports it.
- [ ] Cancelled work shows as cancelled, not deleted.
- [ ] No fixture/test-only names such as `Fixture` or `FX-*` are used for the sales path.

Pacing note:

- Use the list to establish operational load, then open the main work order. Avoid explaining every filter.

## 5. Work Order Detail

- [ ] Header/title/status are clear.
- [ ] Tenant, location, asset, priority, due date, assignee, and reporter context are visible or reachable.
- [ ] Available actions match the logged-in role.
- [ ] Activity/operation log is visible and understandable.
- [ ] Notes, timestamps, and approval/review fields are readable.
- [ ] Parts/evidence/check sections do not look broken if empty.
- [ ] Cancellation reason is visible for cancelled records.
- [ ] Completed record shows completion notes and completion timestamp.
- [ ] The page supports the main story without needing unstable settings/admin screens.

Role action checks:

- [ ] Manager can create/assign/cancel eligible work where intended.
- [ ] Technician can start/complete assigned work where intended.
- [ ] Supervisor can approve/reject supervisor-stage work where intended.
- [ ] Engineer can approve/reject engineer-stage work where intended.
- [ ] Reporter can close/review reporter-closure work where intended.
- [ ] Unauthorized actions are hidden or fail gracefully.

Pacing note:

- This is the core demo screen. Keep narration focused on ownership, proof of work, and audit trail.

## 6. Asset Detail

- [ ] Main asset opens reliably from the work order or asset list.
- [ ] Asset name, code, category, status, criticality, and location are visible.
- [ ] Related work history or asset memory is visible.
- [ ] Completed work tied to the asset appears.
- [ ] Repeated issue history is understandable.
- [ ] PM schedule/context is visible or can be reached.
- [ ] Images/documents do not show sensitive or broken media.
- [ ] The asset page supports the decision story.

Pacing note:

- The message is that work becomes asset memory. Do not turn this into an asset form tour.

## 7. PM Execution Dialog

- [ ] PM work order can be opened.
- [ ] PM execution dialog opens without layout issues.
- [ ] Checklist rows render in order.
- [ ] Required checks are obvious.
- [ ] Yes/no, pass/fail, numeric, text, and photo/signature fields behave appropriately if present.
- [ ] Completion is blocked until required checks are done.
- [ ] Completion notes are clear.
- [ ] Completed checks are preserved after closing/reopening the dialog.
- [ ] The PM work order reaches the intended status through the supported action.
- [ ] PM generation and PM execution are not shown live unless they passed verification.

Fallback:

- If the dialog is unstable, use a prepared completed PM work order and explain generation/execution conservatively.

## 8. Reports Page

- [ ] Reports page loads without errors.
- [ ] Work-order summary is non-empty.
- [ ] Overdue work signal is visible.
- [ ] PM generated/completed or preventive ratio signal is visible.
- [ ] Asset counts and critical asset counts look credible.
- [ ] Inventory low-stock signal is visible.
- [ ] Cost/SLA signals are plausible if shown.
- [ ] Report filters do not break the story.
- [ ] The presenter can point to one management decision.

Required final decision:

- [ ] Escalate overdue work.
- [ ] Investigate repeated AHU issue.
- [ ] Adjust PM frequency or schedule.
- [ ] Restock low inventory item.
- [ ] Rebalance workload by location or team.

Pacing note:

- End here. The buyer should leave remembering the decision, not the navigation.

## 9. Arabic And English Rendering

- [ ] English labels fit within buttons, cards, tables, and dialogs.
- [ ] Arabic labels fit where localized data appears.
- [ ] Mixed Arabic/English names do not overlap.
- [ ] Date, number, and currency formatting are acceptable.
- [ ] Directionality is acceptable for the chosen demo language.
- [ ] Long asset/work-order names wrap cleanly.
- [ ] Buttons do not truncate critical action text.
- [ ] Table columns remain readable with bilingual data.

## 10. Visual Polish

- [ ] No major layout overlap.
- [ ] No broken icons or missing images in the demo path.
- [ ] No raw technical errors are visible.
- [ ] No debug/test-only text appears in the sales path.
- [ ] Loading states are brief or acceptable.
- [ ] Toasts and errors are understandable.
- [ ] Modal/dialog focus and closing behavior are predictable.
- [ ] Color/status labels are readable.
- [ ] The UI feels operational and work-focused, not empty or decorative.

## 11. Demo Pacing Notes

Target flow:

1. Location context.
2. Asset context.
3. Work order creation or prepared issue.
4. Assignment and technician execution.
5. Evidence and approval.
6. Asset memory.
7. Reports and decision.

Timing:

- Opening/problem framing: 3 to 5 minutes.
- Main work-order story: 15 to 20 minutes.
- PM story: 5 to 8 minutes.
- Reports and decision: 5 to 7 minutes.
- Questions and pilot next step: 5 to 8 minutes.

Avoid:

- Settings/admin tour.
- Billing/subscription screens unless asked.
- Unverified public portal path.
- Live PM generation if a prepared PM work order is safer.
- Attachments/photos unless verified.
- Any feature that suggests IoT, BMS, BIM, AI assistant, native mobile app, deep integrations, or unlimited customization is included in Pilot v1.

## 12. Browser Go/No-Go

Go:

- [ ] Main story can be completed without a broken screen.
- [ ] Reports support a real decision.
- [ ] Role-based actions are credible.
- [ ] No sensitive real customer data appears.
- [ ] Presenter has stable backup records.

No-Go:

- [ ] Tenant context is wrong or ambiguous.
- [ ] Reports are empty or broken.
- [ ] Main work-order detail page is broken.
- [ ] PM execution is required for the story but unstable.
- [ ] Arabic/English rendering visibly breaks key screens.
- [ ] Real customer data appears.
- [ ] The demo depends on production data, destructive operations, or `supabase db push`.
