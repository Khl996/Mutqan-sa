# Mutqan Sales Demo Playbook

Status: External Demo GO playbook  
Demo tenant: Noura Gardens Compound Demo  
Scope: controlled Pilot v1 sales demo  
Audience: sales, founders, solution consultants, and demo presenters

---

## 1. Executive Summary

This playbook is for presenting Mutqan with the Noura Gardens Compound Demo tenant in a controlled Pilot v1 sales conversation.

It is not a full product tour. The presenter should not click through every module or imply that every future platform direction is available today. The goal is to show one credible operational story: a maintenance issue becomes a controlled work order, connects to an asset, creates proof of work, becomes asset history, and ends in a practical management decision.

Use this playbook when the customer is evaluating whether Mutqan can become an operational foundation for a pilot. Keep the demo focused on documentation, connected context, workflow discipline, proof of work, asset memory, preventive maintenance, and early decision support.

## 2. Demo Positioning

Present Mutqan as:

- Operational memory for maintenance and facility teams.
- Connected work-order and asset context.
- Proof-of-work and workflow discipline.
- Early decision support for managers.

Do not present Mutqan as:

- An ERP.
- An open-ended custom project.
- An IoT, BMS, BIM, or AI product today.
- A native mobile app demo if the mobile experience is not ready.
- An unlimited customization promise.

Recommended positioning line:

"Mutqan helps facility and maintenance teams preserve operational memory. Work is no longer scattered across chat, calls, spreadsheets, and individual memory. It becomes a connected record tied to a location, asset, owner, workflow, evidence, and management decision."

## 3. Recommended Audience

Best-fit organizations:

- Facility management company.
- Residential or commercial compound.
- Multi-site maintenance operator.

Best-fit attendees:

- Operations and maintenance manager.
- Facility manager.
- Asset manager.
- Executive sponsor.

Optional attendees:

- Maintenance supervisor.
- Technical engineer.
- IT or digital transformation representative.
- Procurement or finance stakeholder when cost or inventory visibility is relevant.

## 4. Demo Duration Options

| Version | Duration | Best For | Recommended Focus |
| --- | ---: | --- | --- |
| Executive version | 15 minutes | Sponsor, owner, director, or decision-maker | Problem, dashboard context, one work order, asset memory, Decision Brief, pilot close. |
| Standard version | 30 minutes | Mixed sales audience | Full connected story from work order to asset memory, PM, and reports. |
| Detailed version | 45 minutes | Operations, maintenance, and implementation stakeholders | Standard story plus role/persona explanation, more workflow detail, PM checklist, and implementation discussion. |

Default to the 30-minute version unless the buyer has clearly requested a shorter executive pass or a deeper operations review.

## 5. Pre-Demo Checklist

Run the automated checks before a serious customer-facing demo in the approved staging/demo environment:

```bash
npm run verify:demo-tenant
npm run verify:workflow-authority
npm run verify:workflow-full
npm run verify:pm-generation
npm run build
npm run lint
```

Complete these browser checks before the call:

- Confirm the Noura Gardens Compound Demo tenant is selected.
- Confirm no real customer data is visible.
- Confirm the Reports page loads.
- Confirm the Decision Brief appears on the Reports page.
- Confirm the main Work Orders list opens.
- Confirm `DEMO-WO-ASSIGNED-001` opens.
- Confirm `DEMO-WO-COMPLETE-001` opens.
- Confirm `DEMO-WO-CANCEL-001` opens if it may be used.
- Confirm `DEMO-WO-PM-001` opens.
- Confirm the PM work order shows PM context or checklist evidence.
- Confirm the `DEMO-AHU-3A` asset detail page opens.
- Confirm browser zoom, language, and screen sharing are ready.
- Confirm backup screenshots or backup records are available if the browser misbehaves.

## 6. Demo Accounts

Use only controlled demo accounts for the Noura Gardens demo tenant:

| Persona | Demo Email |
| --- | --- |
| Admin | `demo.admin@noura-gardens.mutqan.test` |
| Manager | `demo.manager@noura-gardens.mutqan.test` |
| Supervisor | `demo.supervisor@noura-gardens.mutqan.test` |
| Engineer | `demo.engineer@noura-gardens.mutqan.test` |
| Technician | `demo.technician@noura-gardens.mutqan.test` |
| Reporter | `demo.reporter@noura-gardens.mutqan.test` |

Do not include passwords in demo documentation, slides, call notes, or shared messages. Demo password handling must be controlled separately through the approved internal channel.

If account switching is slow or risky, present from the manager or admin account and describe the persona represented at each step.

## 7. Main 30-Minute Demo Script

| Segment | Time | Goal |
| --- | ---: | --- |
| A. Opening problem framing | 3 minutes | Align the buyer around scattered maintenance memory and poor operational visibility. |
| B. Dashboard/context | 2 minutes | Show that the tenant has active operational context without turning the dashboard into the demo. |
| C. Work order story | 10 minutes | Show ownership, status, evidence, completion, and cancellation discipline. |
| D. Asset memory story | 5 minutes | Show that completed work becomes useful asset history. |
| E. PM story | 5 minutes | Show that preventive work is connected to assets and work orders. |
| F. Reports/Decision Brief | 5 minutes | End with management action, not metrics alone. |

Pacing rule: the work order and Reports moments matter most. Do not spend time explaining settings, admin internals, or every filter.

## 8. Exact Screen Sequence

Use this exact sequence for the standard Noura Gardens demo:

1. Dashboard.
2. Work Orders list.
3. `DEMO-WO-ASSIGNED-001`.
4. `DEMO-WO-COMPLETE-001`.
5. `DEMO-WO-CANCEL-001` if needed.
6. `DEMO-AHU-3A` asset detail.
7. `DEMO-WO-PM-001`.
8. Reports page Decision Brief.

## 9. What To Say At Each Step

### A. Opening Problem Framing - 3 Minutes

Screen: Dashboard or start verbally before navigation.

Talking points:

- "Most maintenance teams already work hard. The issue is that the memory of the work is scattered across calls, WhatsApp, spreadsheets, and individual experience."
- "For this demo, I will not show every module. I will show one controlled Pilot v1 story: work is captured, connected to an asset, executed with discipline, preserved as history, and converted into a decision."
- "Mutqan is strongest when a team wants a reliable operational record before expanding into deeper integrations or automation."

Value message:

- No more scattered maintenance memory.

### B. Dashboard/Context - 2 Minutes

Screen: Dashboard.

Talking points:

- "This dashboard is only the starting context. It tells us we are inside the Noura Gardens demo tenant and that there is real operational activity to manage."
- "The important point is not the chart itself. It is that the system has a tenant, work orders, assets, PM activity, and report signals connected in one place."
- "From here, I will move directly into the work order story."

Value message:

- Mutqan gives managers a structured view of current operational activity.

### C. Work Order Story - 10 Minutes

Screen: Work Orders list.

Talking points:

- "This is where informal maintenance demand becomes controlled work."
- "The list shows work in different states, so the manager can see what is pending, assigned, completed, cancelled, or preventive."
- "Notice that preventive and corrective work are distinguished. That matters because planned work and reactive work should not be treated as the same operational signal."

Open: `DEMO-WO-ASSIGNED-001`.

Talking points:

- "This assigned work order represents the active cooling complaint story."
- "Every work order has context: title, status, priority, location, asset, due date, responsible user, and workflow position."
- "The work is not just a ticket number. It has ownership and a path to completion."
- "If this work is overdue, that is not hidden. The manager can see it and decide whether to escalate."

Open: `DEMO-WO-COMPLETE-001`.

Talking points:

- "Here we can see the completed version of the story."
- "Completion is not just clicking done. The completed record keeps notes, timestamps, and operational evidence where available."
- "This is the proof-of-work layer. It helps the team answer what happened, who handled it, and what was recorded."

Open: `DEMO-WO-CANCEL-001` if cancellation comes up or the customer asks about mistakes and duplicates.

Talking points:

- "Cancellation is documented, not deleted."
- "That matters because duplicate or invalid requests still need traceability. A cancelled record explains why the work did not continue."
- "The discipline is that operational history remains reviewable."

Value messages:

- Every work order has context.
- Cancellation is documented, not deleted.
- Proof of work supports accountability.

### D. Asset Memory Story - 5 Minutes

Screen: `DEMO-AHU-3A` asset detail.

Talking points:

- "Now we move from one work order to the asset memory."
- "This is AHU-3A, the asset connected to the cooling complaint story."
- "When work orders are tied to assets, completed work becomes part of the asset history."
- "Over time, this helps the maintenance manager see whether an asset is stable, repeatedly failing, costly, or due for preventive attention."
- "The asset is not just a static register. It becomes a memory of operational events."

Value messages:

- Completed work becomes asset history.
- Asset context helps teams move from reacting to learning.

### E. PM Story - 5 Minutes

Screen: `DEMO-WO-PM-001`.

Talking points:

- "Preventive maintenance should not live separately from work execution."
- "This PM work order is connected to the asset and includes PM context and checklist evidence."
- "The team can distinguish preventive work from corrective work, which helps managers understand whether they are mainly reacting to failures or following a planned maintenance rhythm."
- "For Pilot v1, the important proof is that PM creates or supports work records that can be executed and reviewed."

Value messages:

- PM is connected to assets and work orders.
- Planned work becomes part of the same operational record.

### F. Reports/Decision Brief - 5 Minutes

Screen: Reports page Decision Brief.

Talking points:

- "We end in Reports because the demo should finish with a decision, not with navigation."
- "The Decision Brief translates operational records into action signals."
- "Examples include overdue work to escalate, repeated demand on an asset or location, PM compliance to monitor, low-stock items to restock, or workload pressure to rebalance."
- "Reports are only as useful as the data captured. That is why the pilot focuses first on disciplined records and connected context."
- "The manager should leave this screen knowing what to do next."

Value messages:

- Reports end with an action.
- Early decision support comes from disciplined operational records.

## 10. Key Value Messages

Use these messages throughout the demo:

- No more scattered maintenance memory.
- Every work order has context.
- Completed work becomes asset history.
- PM is connected to assets and work orders.
- Reports end with an action.
- Cancellation is documented, not deleted.

## 11. Objection Handling

| Objection or Question | Recommended Answer |
| --- | --- |
| Can we customize modules? | "Pilot v1 is configuration-led. We can adapt supported roles, labels, locations, categories, PM schedules, and workflows where the product supports it. We do not position the pilot as a custom software project or a per-customer code fork." |
| Can we rename locations/buildings? | "Yes, within supported configuration. Mutqan can represent the customer's operational hierarchy, such as compound, building, floor, unit, site, zone, or asset group." |
| Does it support Arabic and English? | "Mutqan supports Arabic and English in the product direction and demo flow. For a sales demo, we choose the language deliberately and verify the key screens before the call so labels and data render correctly." |
| Is it only for hospitals? | "No. Mutqan is designed for maintenance and facility operations across asset-heavy environments. Hospitals can be one segment, but this Noura Gardens demo uses a residential compound scenario." |
| Does it integrate with IoT/BMS/BIM? | "Those are future directions or separately scoped integration projects. Pilot v1 focuses on proving the operational foundation first: records, context, workflow, asset memory, and reports." |
| Is this an ERP? | "No. Mutqan is not positioned as an ERP. It is an operations, maintenance, and asset-management foundation that can coexist with ERP or finance systems where needed later." |
| What about mobile app? | "For this Pilot v1 demo, we should not promise a native mobile app unless it is ready and verified. The pilot can validate the workflow through supported browser-based use and controlled users." |
| What if we only want work orders? | "That can be a valid pilot entry point. We would still recommend connecting work orders to locations and assets where possible, because that is what turns tickets into operational memory." |
| How long does implementation take? | "For a controlled pilot, timing depends on data readiness and scope. A practical first pilot can often be framed around 2 to 4 weeks for a narrow proof, or longer if the customer needs more setup, users, assets, and training." |
| Is our data isolated? | "Mutqan is designed as a SaaS product with tenant-level separation and role-based access. For a pilot, we also limit data to the agreed operational scope and avoid unnecessary sensitive information." |
| Can technicians use it easily? | "The pilot should keep technician workflows focused: see assigned work, update status, add notes or evidence, and complete the task. We validate ease of use with a small controlled user group before scaling." |

## 12. What Not To Show Unless Asked

Avoid these screens and topics unless the customer specifically asks and the presenter can keep the answer controlled:

- Billing or subscription internals.
- Deep admin settings.
- Migration or security internals.
- Public portal if it has not been verified for that prospect.
- Future IoT, BMS, BIM, or AI capabilities as if already live.
- Native mobile app flow if it is not ready and verified.
- Raw technical logs.
- Seed scripts, database tools, or staging internals.
- Unverified integrations.

If asked about an excluded or future area, answer briefly, classify it as roadmap, future direction, annual expansion, or separately scoped work, then return to the Pilot v1 story.

## 13. Controlled Pilot Close

Use this closing script:

"What we showed today is the right scope for a controlled pilot. We do not need to transform the whole operation on day one. We should choose one facility, building, asset group, or team, load the minimum useful data, and prove that Mutqan can document work, connect it to assets and locations, preserve proof of work, and give managers useful decision signals."

"A practical pilot can run for 2 to 4 weeks if the scope is narrow and the starter data is ready. For a larger or more operationally realistic pilot, we can define a longer period. The key is that we agree success criteria before kickoff."

Recommended pilot success criteria:

- Selected users complete real work orders in Mutqan.
- Work orders are connected to locations and assets.
- Technicians or responsible users update status and notes.
- Completed work appears in asset history.
- Preventive maintenance is demonstrated if PM is in scope.
- Reports identify at least three useful management actions.
- The customer can name the next expansion scope after the pilot.

Required customer data:

- Pilot owner and executive sponsor.
- User list and roles.
- Location hierarchy.
- Starter asset list.
- Initial work-order categories or issue types.
- Preventive maintenance schedules and checklists if PM is included.
- Starter inventory items if inventory is included.
- Any reporting priorities the customer wants reviewed at the end.

Next meeting:

"The next step should be a pilot qualification and setup meeting. In that meeting we confirm the pilot scope, required data, users, success criteria, timeline, and go/no-go conditions."

## 14. Demo Failure Fallback

Do not debug live in front of the prospect. Keep the story moving.

| Failure | Fallback |
| --- | --- |
| PM page fails | Use the prepared completed PM work order or the PM context visible on `DEMO-WO-PM-001`. Explain PM conservatively as connected planned work, not as a live generation show. |
| Reports fail | Use prepared screenshots if available, or explain that reports are being refined and that the pilot's reporting quality depends on captured data. Return to the completed work order and asset history story. |
| Role switching is slow | Present from the manager account and describe personas verbally. Say, "I will keep this in one account so the flow stays clear." |
| Browser issue appears | Do not debug live. Move to a backup record, refresh only once if needed, or continue with screenshots and narrative. |
| Main assigned work order fails | Open `DEMO-WO-COMPLETE-001` and tell the story from the completed evidence backward. |
| Asset page fails | Use the asset link or asset context inside the work order detail and explain that the completed work remains tied to the asset record. |
| Cancellation record fails | Skip cancellation unless asked. The core value story does not depend on it. |

## 15. After-Demo Follow-Up

Send a concise follow-up within the same business day where possible:

- Send the Pilot v1 scope.
- Send a summary of observed customer needs.
- Send the setup checklist.
- Schedule the technical onboarding or pilot qualification call.
- Record objections and feature requests.
- Identify out-of-scope requests separately from committed pilot scope.
- Confirm the proposed pilot owner, sponsor, and selected operational area.

Follow-up tone:

"Based on today's discussion, the strongest pilot path appears to be a controlled work-order and asset-memory pilot for the selected facility or asset group. We will keep the scope practical, define success criteria, and separate immediate pilot needs from roadmap or integration requests."

## 16. Final Demo Go/No-Go Reminder

External Demo GO only applies when:

- The Noura Gardens tenant is selected and stable.
- No real customer data is visible.
- The pre-demo verification checks have passed in the approved environment.
- Dashboard, Work Orders, `DEMO-WO-ASSIGNED-001`, `DEMO-WO-COMPLETE-001`, `DEMO-WO-PM-001`, `DEMO-AHU-3A`, and Reports Decision Brief are ready.
- The presenter has backup records or screenshots.
- The presenter will not promise ERP replacement, unlimited customization, native mobile, IoT, BMS, BIM, or AI as current Pilot v1 deliverables.

No-Go if:

- Tenant context is wrong or ambiguous.
- Main work order detail cannot be opened.
- Reports are broken and no backup is prepared.
- Real customer data is visible.
- The demo depends on live debugging, destructive data changes, production data, or unverified future capabilities.

Final presenter reminder:

"The buyer should remember one thing: Mutqan turns maintenance activity into connected operational memory that supports practical decisions."
