# Mutqan Demo Story Script

## 1. Executive Summary

This document defines the official Mutqan demo story for sales presentations, controlled pilot discussions, and internal alignment.

The demo must present Mutqan as a connected operational story, not as a tour of disconnected pages. The story is:

`Problem -> Location -> Asset -> Work Request -> Work Order -> Technician -> Execution Evidence -> Approval -> Asset Memory -> Report -> Decision`

Mutqan should be positioned as a flexible operations, maintenance, and asset management platform designed to become the living operational memory of a facility and a decision-support companion for maintenance, facility, and asset managers.

Every demo step should support at least one of:

1. Document what happens.
2. Connect what happens to its operational context.
3. Turn what happens into a decision.

The Pilot v1 demo should focus on Mutqan's current strengths: operational documentation, connected context, workflow discipline, asset memory, proof of work, and basic decision support. It must not promise IoT, BMS, BIM, AI assistant, native mobile app, deep integrations, or enterprise customization as available Pilot v1 features.

## 2. Demo Objective

The demo objective is to show that Mutqan can help an operations or maintenance team move from informal work tracking to a structured operational record.

The customer should leave understanding that Mutqan can:

- Capture a maintenance issue as a controlled operational record.
- Connect the issue to the right location, asset, team, and responsible user.
- Move work through a disciplined workflow.
- Preserve timestamps, notes, attachments/photos where applicable, and approval history.
- Build operational memory around assets and locations.
- Surface basic operational signals for management decisions.

The demo is not intended to prove every future feature. It is intended to prove the operational foundation for a controlled Pilot v1.

## 3. Target Audience

Primary priority audiences:

- Facility management companies, including owners, directors, and operations managers.
- Residential or commercial compounds and their property or operations managers.
- Multi-site maintenance projects and their project managers.

Secondary or controlled-scope audiences:

- Maintenance managers and supervisors.
- Asset and facility managers responsible for uptime, service quality, and work visibility.
- Finance or procurement stakeholders interested in cost and inventory visibility.
- IT or digital transformation stakeholders reviewing SaaS fit and implementation effort.
- Customer executives evaluating whether Mutqan can scale beyond the pilot scope.

Avoid leading the demo with regulated or highly specialized scenarios unless the customer specifically belongs to that segment and the scope is controlled.

## 4. Recommended Demo Duration

Recommended duration: 30 to 40 minutes.

Suggested timing:

| Segment | Time | Purpose |
| --- | --- | --- |
| Opening and context | 3 to 5 minutes | Align on the customer's operational problem |
| Main operational story | 18 to 25 minutes | Demonstrate the connected workflow from issue to decision |
| Reporting and decision discussion | 5 to 7 minutes | Show management value beyond work tracking |
| Fit, questions, and pilot next step | 5 to 8 minutes | Confirm interest, objections, and next action |

For executive audiences, keep the workflow steps shorter and spend more time on reporting, accountability, and pilot success criteria.

For operations audiences, spend more time on work order details, technician execution, proof of work, and approval flow.

## 5. Required Demo Tenant Data

The demo tenant should be prepared before any serious customer presentation.

| Data Area | Required Setup | Demo Purpose |
| --- | --- | --- |
| Tenant | One realistic facility management, compound, or multi-site maintenance tenant | Make the scenario believable |
| Locations | One flexible hierarchy such as compound -> building -> floor -> unit, project -> site -> zone, or area -> asset group | Show where the issue happens |
| Asset | One critical or familiar asset tied to the selected location | Connect work to operational context |
| Work request | One reported issue for the selected asset or location | Start with a real operational problem |
| Work orders | Several seeded work orders in different statuses: pending, assigned, in progress, approval, completed, and overdue | Support live story and reporting |
| Users | Reporter, technician, supervisor, engineer or maintenance manager, and facility manager accounts | Demonstrate role-based ownership |
| Teams | At least one maintenance team or responsible group | Show assignment and accountability |
| Evidence | Completion notes, timestamps, activity logs, and sample attachments/photos where applicable | Demonstrate proof of work |
| Approval history | At least one work order with supervisor or engineer review where configured | Demonstrate workflow discipline |
| Asset history | Completed work records tied to the selected asset | Show asset memory |
| Inventory | A small set of spare parts, including one low-stock item and one item consumed against work where available | Show operational risk signals |
| Reports | Enough data to show open work, overdue work, PM gaps, repeated demand, workload, inventory, or cost indicators where available | End with decisions, not page navigation |

Do not enter sensitive personal, patient, financial, or regulated data unless explicitly approved for that demo.

## 6. Demo Roles/Personas

Use personas to make the demo feel like daily operations, not software navigation.

| Persona | Role In Story | Demo Account Need |
| --- | --- | --- |
| Reporter or resident contact | Reports the issue or initiates the request | Optional if using public request flow; otherwise represented by seeded data |
| Maintenance coordinator | Reviews demand and creates or assigns the work order | User with work order create/manage permissions |
| Technician | Handles the task and records execution evidence | User with work order update permissions |
| Supervisor | Reviews completion evidence and approves or rejects | User with approval permissions where configured |
| Engineer or maintenance manager | Reviews technical closure or final closure where configured | User with approval/manage permissions |
| Facility or operations manager | Reviews reports and decides follow-up action | User with reports and management visibility |

If switching accounts interrupts the demo, use one admin or manager account and explain which persona is represented at each moment.

## 7. Main Demo Storyline

Use one scenario throughout the demo.

Recommended scenario:

A repeated air-conditioning issue is reported in a selected residential or commercial compound location. The issue is tied to a known HVAC asset. Mutqan converts the issue into a controlled work order, assigns it to a technician, captures completion evidence, routes it through the supported approval workflow, stores the result in the asset's operational memory, and shows the manager operational signals that require follow-up.

The story should prove this chain:

`Issue reported -> Location identified -> Asset opened -> Work order controlled -> Technician executes -> Evidence captured -> Approval completed -> Asset history updated -> Reports reviewed -> Decision made`

The final management decision should be simple and credible, such as:

- Escalate overdue work.
- Investigate repeated demand on one asset or location.
- Adjust the preventive maintenance plan.
- Rebalance technician workload.
- Review low-stock spare parts.

## 8. Step-By-Step Demo Script

The main script should be followed in order. Do not jump to every module.

Demo rule: Do not present Mutqan as a page-by-page tour. Every screen must be introduced as part of the operational story. If a screen does not support the story, skip it.

| Step | Story Beat | Screen/Page To Show | What To Say | Value To Highlight |
| --- | --- | --- | --- | --- |
| 1 | Set the operational problem | Optional opening on `/dashboard` or start directly on `/facilities` | "Most maintenance teams already do the work. The problem is that the evidence is scattered across calls, chat, spreadsheets, and memory. Mutqan turns the work into a connected operational record." | Mutqan is not a page collection; it is operational memory |
| 2 | Show the location context | `/facilities` | "We start with where the issue happened. Mutqan treats locations as a flexible operational hierarchy, so this could be a compound, project, site, building, unit, zone, or asset group." | Connect what happens to place and responsibility |
| 3 | Open the affected asset | `/assets` then `/assets/:id` | "This issue is not floating in the system. It is connected to a specific asset with its own context, history, and operational importance." | Asset context, criticality, and future memory |
| 4 | Show or create the work request/work order | `/work-orders` | "The reported issue becomes a controlled work order. From here, the team can track status, priority, due date, location, asset, reporter, and owner." | Document the issue as a managed record |
| 5 | Assign ownership | `/work-orders/:id` | "The work order is assigned to a responsible person or team, so ownership is visible instead of sitting in a chat message." | Accountability and workflow discipline |
| 6 | Start technician execution | `/work-orders/:id` using available actions | "When the technician starts work, Mutqan records the operational movement from assigned to in progress." | Status trail and timestamped activity |
| 7 | Capture execution evidence | `/work-orders/:id`; completion notes, parts where enabled, attachments/photos where applicable | "Completion is not just a button. The technician records what was done, adds notes, uses parts where tracked, and attaches evidence where applicable." | Proof of work |
| 8 | Show approval workflow | `/work-orders/:id`; workflow progress and review actions | "The work can move through supported review steps such as supervisor approval, engineer review, or final closure, depending on the tenant setup." | Controlled approval and rejection path |
| 9 | Review activity log | `/work-orders/:id`; activity log | "This is the operational memory of the work order: who acted, when it changed, what was recorded, and why it was approved or returned." | Auditability and traceability |
| 10 | Show asset memory | `/assets/:id` or `/asset-logs` | "Once completed, the work becomes part of the asset's history. Over time, this helps the manager see whether the asset is stable, costly, or repeatedly failing." | Completed work becomes asset intelligence |
| 11 | Show operational reports | `/reports` | "Now we move from records to decisions. Reports help identify overdue work, repeated demand, PM completion gaps, workload risks, inventory risks, and cost signals where data exists." | Decision support from operational data |
| 12 | Close with a management decision | `/reports`, then optionally return to the asset or work order | "Based on this signal, the manager can decide what to follow up: escalate overdue work, inspect a repeated failure, adjust PM, rebalance workload, or prepare spare parts." | Turn what happened into a decision |

## 9. What To Say At Each Step

Use concise language. The presenter should narrate business value, not explain every button.

Opening:

"Mutqan is not here to replace your team's experience. It is here to preserve it, organize it, and turn it into operational memory that the whole organization can rely on."

"Mutqan is designed for teams that need more than a list of work orders. The goal is to document what happens, connect it to the right operational context, and help managers make better decisions."

Location:

"The first question in operations is always: where is the problem? Mutqan lets us model locations flexibly, whether the customer thinks in buildings and floors, project sites and units, or zones and asset groups."

Asset:

"The second question is: what is affected? When work is tied to an asset, every repair contributes to the asset's operational memory."

Work order:

"This is where informal demand becomes a controlled record. The team can see what was reported, who owns it, how urgent it is, and where it sits in the workflow."

Technician execution:

"The technician does not just close the issue verbally. Mutqan captures execution notes, timestamps, responsible users, parts where enabled, and supporting evidence where applicable."

Approval:

"The approval step protects quality. A supervisor or engineer can approve the work or return it with a reason, depending on the supported workflow configuration."

Asset memory:

"The completed work is not lost after closure. It becomes part of the asset's operating history, which is the foundation for better maintenance decisions later."

Reports:

"The report is where the manager stops asking for manual updates and starts seeing operational signals: overdue work, repeated demand, PM gaps, workload pressure, and inventory risks where data exists."

Closing:

"This is the Pilot v1 promise: a controlled operational foundation. Mutqan records the work, connects it to context, and turns it into practical management visibility."

Final decision moment:

The demo must end with a clear decision moment. The presenter should say: "Based on what we saw, the manager now has at least one practical follow-up decision: investigate this repeated asset issue, escalate overdue work, adjust the PM plan, or review spare parts availability. This is where Mutqan moves from tracking work to supporting decisions."

## 10. What Screen/Page To Show At Each Step

Recommended screen sequence:

1. `/facilities` for location context.
2. `/assets` and `/assets/:id` for the selected asset.
3. `/work-orders` for work order list, filters, status, and priority.
4. `/work-orders/:id` for details, assignment, workflow progress, activity log, and actions.
5. `/inventory` only if parts or low-stock risk is in scope and ready.
6. `/maintenance` only if showing PM context or PM completion gaps is relevant to the customer.
7. `/asset-logs` or `/assets/:id` for asset memory where available.
8. `/reports` for the final management view.

Optional screen:

- `/portal/:token` if the public request portal is configured and stable for the demo tenant.

Avoid opening settings, platform administration, billing, subscriptions, or tenant configuration unless the customer specifically asks and the presenter can keep it short.

## 11. What Value To Highlight At Each Step

Use these value points as the presenter checklist:

- Problem: maintenance demand is usually scattered and hard to trust.
- Location: every issue needs a place in the operational hierarchy.
- Asset: every issue should connect to what is affected.
- Work request/work order: informal work becomes controlled work.
- Technician: responsibility and status are visible.
- Evidence: notes, timestamps, responsible users, attachments/photos where applicable, and parts where enabled create proof of work.
- Approval: supported review steps improve discipline and quality.
- Asset memory: completed work becomes useful history.
- Report: the manager sees operational signals, not only activity counts.
- Decision: the demo must end with an action the manager would take.

## 12. Expected Customer Reactions/Questions

Expected positive reactions:

- "This is more organized than our current spreadsheets."
- "We can finally see who owns each task."
- "This helps us prove work was done."
- "The asset history could help us identify repeated problems."
- "Reports would reduce manual follow-up."

Expected questions:

| Question | Recommended Response |
| --- | --- |
| Can we use our own location structure? | "Yes, within supported configuration. Mutqan treats locations as a flexible operational hierarchy." |
| Can technicians use it from the field? | "Pilot v1 supports browser-based use where the environment allows. A native mobile app is not part of Pilot v1." |
| Can we connect to BMS, IoT, ERP, or other systems? | "Those are future directions or separate integration scopes. Pilot v1 focuses on proving the operational foundation first." |
| Can the workflow match our exact internal approval process? | "Pilot v1 is configuration-led. We can use supported roles, labels, statuses, and workflow settings, but not customer-specific code forks." |
| Can we import all historical data? | "Pilot v1 uses limited data needed to prove the workflow. Full historical migration is separate." |
| Can reports show everything management wants? | "Reports depend on the data captured. Pilot v1 focuses on basic operational signals from the selected scope." |

## 13. Objection Handling During Demo

| Objection | Response |
| --- | --- |
| "We already use WhatsApp and spreadsheets." | "Those can support communication, but they are weak as the source of truth. Mutqan gives the work a structured record, owner, status, asset, location, and history." |
| "We need integrations before we can start." | "Integrations can matter later, but the pilot should first prove that the team can capture reliable operational records inside Mutqan." |
| "Our process is more complex than this." | "That is normal. Pilot v1 deliberately starts with the workflow that proves value without turning the pilot into a custom project." |
| "Technicians may resist using a system." | "That is why the pilot should focus on a small user group, simple workflows, and proof of work that managers actually use." |
| "We need mobile." | "The Pilot v1 scope does not include a native mobile app. For the pilot, we validate the workflow through supported browser-based use and controlled users." |
| "Can Mutqan automatically detect faults?" | "Not in Pilot v1. IoT, BMS, AI, and automated detection are future directions or separate scopes." |
| "Can we customize everything?" | "Pilot v1 customization is configuration-led. We adapt through supported settings and templates, not customer-specific code." |

## 14. What Not To Show In Pilot v1 Demo

Do not show or promise the following as included Pilot v1 capabilities:

- IoT device connectivity.
- BMS integration.
- BIM model integration or BIM viewer workflows.
- AI assistant, chatbot, predictive AI, or automated recommendations.
- Native iOS or Android application.
- Offline-first execution.
- Deep ERP, finance, HR, procurement, CAFM, CMMS, SSO, access control, or vendor integrations.
- Customer-specific APIs.
- Customer-specific database schema changes.
- Per-customer UI redesign.
- Per-customer code forks.
- Unlimited approval workflow modeling.
- Full historical migration and cleansing.
- 24/7 support or managed maintenance operations.

If asked, frame these as future directions, roadmap candidates, annual expansion items, or separately scoped professional services. Return the conversation to Pilot v1: operational documentation, connected context, proof of work, workflow discipline, asset memory, and decision support.

## Demo Quality Checklist

- Demo tenant opens correctly.
- Selected location has assets and work orders.
- Selected asset has at least one completed and one active work order.
- Work order statuses are visually clear.
- At least one work order demonstrates evidence or notes.
- Approval workflow is either ready or intentionally skipped.
- Reports have enough data to show at least one operational signal.
- No sensitive or real customer-confidential data is visible.
- Presenter knows the backup plan for unstable features.
- The demo ends with a clear pilot next step.

## 15. Demo Success Criteria

A demo is successful when the customer can repeat the Mutqan story in their own words:

- A problem is captured.
- The problem is connected to a location and asset.
- The work is assigned and executed.
- Evidence and approvals are traceable.
- Completed work becomes part of operational memory.
- Reports reveal signals that guide decisions.

Practical success indicators:

- The customer identifies one real pilot location or asset group.
- The customer names a pilot owner or champion.
- The customer asks about setup data, users, and timeline.
- The customer accepts that Pilot v1 is controlled and configuration-led.
- The customer can identify at least one decision they want Mutqan to support.

## 16. Backup Plan If A Feature Is Not Ready

Do not improvise or overpromise. Use a prepared fallback.

| If This Is Not Ready | Backup Plan | How To Explain It |
| --- | --- | --- |
| Public request portal | Start from a seeded work order in `/work-orders` | "For this demo, we will start from the controlled work record that the team manages." |
| Live work order creation | Use a prepared work order in pending or assigned status | "The important proof is the operational chain from issue to closure." |
| Role switching | Use one manager/admin account and describe the persona represented | "I will show the workflow from one account to keep the story moving." |
| Attachments/photos | Use completion notes and activity log, and mention attachments only where applicable | "Evidence can include notes and timestamps; photos depend on setup and demo readiness." |
| Inventory consumption | Show inventory risk separately in `/inventory` or skip it | "Inventory is included only where pilot data supports it." |
| Approval workflow | Use a seeded work order already in approval status or explain configured workflow | "Approval steps depend on tenant settings and pilot scope." |
| Asset history | Show completed work linked to the asset or use `/asset-logs` where available | "The key point is that work records stay connected to the asset." |
| Reports lack data | Use seeded report data or explain that reports reflect captured pilot records | "Reports become useful when real work is entered during the pilot." |

If a feature is not stable, do not click into it live. Use a seeded record, screenshot only if approved for that demo, or skip the step and explain the intended pilot behavior conservatively.

## 17. Post-Demo Follow-Up Actions

After the demo, the Mutqan team should send a concise follow-up.

Recommended follow-up actions:

- Share the Pilot v1 scope document.
- Confirm the customer's target pilot facility, location hierarchy, or asset group.
- Confirm the operational problem they want to prove first.
- Identify the sponsor, pilot owner, and core users.
- Request starter data for locations, assets, users, PM schedules, and inventory where applicable.
- List open questions and any out-of-scope requests.
- Confirm that excluded items such as IoT, BMS, BIM, AI assistant, native mobile app, deep integrations, and enterprise customization are not Pilot v1 blockers.
- Propose the next meeting: pilot qualification or pilot kickoff.

The follow-up should keep the same message as the demo: Mutqan proves value by documenting work, connecting context, and supporting decisions.

## 18. Final Closing Statement

Use this closing statement or adapt it slightly to the customer:

"What we showed today is the foundation Mutqan is built on. A maintenance issue is no longer just a message, a spreadsheet row, or someone's memory. It becomes a connected operational record: tied to a location, tied to an asset, assigned to a responsible person, supported by evidence, reviewed through workflow, preserved in asset history, and visible in reports that help managers decide what to do next. That is the right scope for a controlled Pilot v1."
