# Mutqan Product UI Principles

## Purpose
This document defines the foundational product UI principles for Mutqan. It is not a component library yet and it is not a full UI kit. It is the decision framework that should guide future UI kit, design system, and product interface work.

The product UI must help operational teams understand what is happening, where it is happening, who is responsible, what is at risk, and what should happen next.

## Product UI philosophy
Mutqan product interface is a workspace, not a marketing page.

It should be calm, readable, operational, and trustworthy. It should reduce the cognitive load on facility managers, maintenance managers, supervisors, engineers, technicians, and reporters.

The interface should not compete for attention. It should direct attention.

## Core UI principles

### 1. Role-first screens
Every major screen should start from the question of the user role.

Examples:
- Technician: What do I need to do now?
- Supervisor: What is waiting for my approval?
- Maintenance manager: Where is the operational risk today?
- Facility manager: Which locations need attention?
- Asset manager: Which asset needs a decision?
- Reporter: What happened to my request?
- Platform admin: What tenant, subscription, or support action needs review?

Do not design generic pages only around modules. Design around operational responsibility.

### 2. Operational hierarchy before visual density
Mutqan may contain rich data, but the UI must show the most important context first.

Recommended hierarchy:
1. Current state.
2. Next action.
3. Responsible person or team.
4. Location.
5. Asset.
6. Priority or risk.
7. Due time or SLA.
8. Evidence and notes.
9. Historical details.
10. Secondary metadata.

If everything is visually equal, the interface has failed.

### 3. State clarity
Every status must be clear through text, color, and context. Color alone is not enough.

Examples of states that must be unmistakable:
- Pending.
- Assigned.
- In progress.
- On hold.
- Waiting for supervisor approval.
- Waiting for engineer review.
- Waiting for reporter closure.
- Completed.
- Auto-closed.
- Rejected.
- Cancelled.
- Overdue.
- Critical.

Each state should answer:
- What does this mean?
- Who owns the next step?
- Can the user act now?

### 4. Tables are for scanning, cards are for action
Use tables when users need to compare, sort, filter, or scan many records.

Use cards when users need to make a quick decision or take an action.

Use timelines when users need to understand history.

Use briefs when users need interpretation and recommendations.

### 5. Timeline is a core memory pattern
Because Mutqan is an operational memory platform, timelines are not decorative. They are a core interface pattern.

Timelines should be used for:
- Work order story.
- Asset history.
- Location activity.
- Audit log.
- Proof of Work.
- Support access history.
- Subscription or payment events.

A timeline should show:
- What happened.
- When it happened.
- Who did it.
- Why it matters.
- What evidence or note is attached.

### 6. Decision cards before raw charts
Charts are useful, but they are not enough. The UI should explain what the data means.

For important reports, include decision cards that answer:
- What changed?
- Where is the risk?
- Why might this be happening?
- What action should be reviewed?
- How confident is the signal?

Avoid dashboards that show numbers without interpretation.

### 7. Empty states must teach the product vision
Do not show only No data available.

An empty state should explain why the data matters and what to do next.

Weak:
> No assets found.

Better:
> Add your first asset so Mutqan can connect work orders to asset history and build an operational record over time.

### 8. Field users need task-first UI
Technicians and field users should not be forced to navigate the full system.

Their UI should prioritize:
- My tasks today.
- Priority.
- Location.
- Asset.
- Instructions.
- Start action.
- Add note/photo.
- Use parts.
- Complete action.

The technician should feel that Mutqan helps execution, not administration.

### 9. Managers need risk-first UI
Managers do not only need counts. They need attention signals.

Manager screens should highlight:
- Overdue work.
- Critical assets.
- Locations under pressure.
- Repeated failures.
- Delays by reason.
- PM compliance issues.
- Inventory impact.
- Pending approvals.

### 10. Product UI must support Arabic and English equally
Arabic is not an afterthought and English is not a literal translation.

Rules:
- RTL must be natural.
- Text length differences must be expected.
- Buttons must handle Arabic labels without crowding.
- Dates, numbers, and statuses must remain readable.
- Icons must not imply direction incorrectly.
- Layout should not break in either language.

## Key product patterns

### Work Order Story
A work order should be presented as an operational story, not only as a ticket.

It should show:
- Request source.
- Location.
- Asset.
- Priority.
- Assignment.
- Start and completion times.
- Technician notes.
- Used parts.
- Photos or attachments.
- Approval/rejection steps.
- Closure context.
- Impact on the asset record.

### Asset Passport
An asset should feel like it has an identity and memory.

A strong asset page should eventually show:
- Asset identity.
- QR code.
- Location.
- Status.
- Criticality.
- Health or risk signal.
- Recent failures.
- Preventive maintenance history.
- Work order history.
- Cost signals.
- Warranty or lifecycle data.
- Recommended next review.

### Proof of Work
Completed work should be easy to prove.

A Proof of Work view should include:
- Work order number.
- Location.
- Asset.
- Technician.
- Start and completion times.
- Before/after evidence when available.
- Parts used.
- Approval history.
- Closure notes.
- Verification link or QR when supported.

### Decision Brief
Reports should move from numbers to decisions.

A Decision Brief should include:
- Summary.
- Key risks.
- Repeated issues.
- Delay reasons.
- Asset or location signals.
- Suggested review points.
- Data limitations when relevant.

### Facility Pulse
Facility Pulse is a future-facing product pattern that summarizes operational condition.

It should not be presented as implemented unless it is actually implemented.

When implemented, it should be:
- Explainable.
- Based on operational data.
- Not a black box.
- Supported by reasons.
- Calm and credible.

## Component principles for future UI Kit

### Buttons
Buttons should make the next action obvious.

Rules:
- One primary action per area.
- Dangerous actions require explanation.
- Avoid vague labels like Submit when a more specific label is possible.
- Use action labels such as Start work, Assign, Approve, Reject, Complete, Generate report.

### Cards
Cards should be used for operational focus.

A card should have:
- Clear title.
- State or signal.
- Most important context.
- Next action.
- Optional secondary details.

### Badges
Badges should communicate status, priority, risk, or category.

Rules:
- Use consistent colors.
- Include text.
- Avoid using badges for decoration.

### Tables
Tables must prioritize scanability.

Rules:
- Important columns first.
- Clear status column.
- Filters for status, priority, location, asset, assignee, and date where relevant.
- Avoid overwhelming columns by default.

### Modals
Modals should be used for focused decisions or forms.

Rules:
- Avoid long multi-step workflows in small modals.
- Use clear confirmation language for risky actions.
- Explain impact before destructive or workflow-changing actions.

### Forms
Forms must reduce operational friction.

Rules:
- Group related fields.
- Mark required fields clearly.
- Use sensible defaults.
- Explain fields that affect workflow or reporting.
- Avoid asking field users for information that can be inferred.

### Navigation
Navigation should reflect how teams work, not only how modules are stored.

Future navigation may include:
- Today’s work.
- Pending approvals.
- Locations needing attention.
- Critical assets.
- Work orders.
- Assets.
- Preventive maintenance.
- Inventory.
- Reports.
- Settings.

## Visual behavior in product UI

### Motion
Motion in the product should be minimal and functional.

Allowed:
- Loading states.
- Small transitions.
- Timeline reveals.
- Status feedback.
- Subtle attention pulse for critical states.

Avoid:
- Decorative movement.
- Continuous animation without purpose.
- Heavy transitions that slow field work.

### Color
Color should support meaning, not decoration.

Color categories:
- Primary navigation and structure.
- Accent and positive action.
- Warning.
- Critical/destructive.
- Informational.
- Muted background and surfaces.

Status colors must be consistent across modules.

### Typography
Typography must prioritize readability.

Rules:
- Use strong headings for hierarchy.
- Use readable body sizes.
- Avoid overly small operational text.
- Support Arabic and English without crowding.

## Product UI governance checklist

Before approving any new screen or major UI change, ask:

1. Which role is this screen for?
2. What is the primary action?
3. What is the most important state?
4. Is location and asset context visible when relevant?
5. Does the page support Arabic and English?
6. Does it use existing tokens and patterns?
7. Does it avoid unnecessary visual noise?
8. Does it explain empty, error, and loading states?
9. Does it preserve operational memory?
10. Does it help a user make a better next action?

## Employee onboarding summary

Any new designer or frontend developer should understand this:

Mutqan product UI is not a generic dashboard. It is an operational workspace. Its job is to make maintenance work understandable, traceable, and actionable. The UI should show the right context at the right time: state, action, owner, location, asset, risk, evidence, and decision.
