import { loadContractSnapshot } from "./near-rpc.js";
import { initializeWallet } from "./wallet.js";
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const state = {
  page: "overview",
  policies: [
    {id:"treasury-ops",name:"Treasury operations",status:"Active",scope:"Payments · NEAR",perTx:"250",budget:"5,000",spent:"1,840",version:8,expiry:"Dec 18, 2026",destinations:["merchant.near","payroll.near","ops-vault.near"]},
    {id:"research-spend",name:"Research agent spend",status:"Active",scope:"Research · Testnet",perTx:"40",budget:"600",spent:"214",version:3,expiry:"Nov 30, 2026",destinations:["data-provider.near","compute.near"]},
    {id:"growth-campaign",name:"Growth campaign",status:"Paused",scope:"Marketing · Testnet",perTx:"100",budget:"1,000",spent:"0",version:2,expiry:"Jan 10, 2027",destinations:["campaigns.near"]}
  ],
  agents: [
    {id:"agent-01",name:"Treasury agent",account:"treasury-agent.testnet",policy:"treasury-ops",status:"Enabled",key:"key_••••••a91f",last:"4 min ago",requests:38},
    {id:"agent-02",name:"Research runner",account:"research-agent.testnet",policy:"research-spend",status:"Enabled",key:"key_••••••b82c",last:"18 min ago",requests:21},
    {id:"agent-03",name:"Growth operator",account:"growth-agent.testnet",policy:"growth-campaign",status:"Disabled",key:"key_••••••c43d",last:"2 days ago",requests:7},
    {id:"agent-04",name:"Invoice processor",account:"invoice-agent.testnet",policy:"treasury-ops",status:"Enabled",key:"key_••••••d11a",last:"1 hour ago",requests:14}
  ],
  intents: [
    {id:"int_8f21c",agent:"treasury-agent.testnet",destination:"merchant.near",amount:"85",purpose:"Vendor invoice #INV-2048",status:"Authorized",risk:"Clear",time:"09:42:18"},
    {id:"int_8f21b",agent:"research-agent.testnet",destination:"compute.near",amount:"32",purpose:"Model inference credits",status:"Review",risk:"Medium",time:"09:38:04"},
    {id:"int_8f21a",agent:"treasury-agent.testnet",destination:"unknown.near",amount:"410",purpose:"Unverified supplier payment",status:"Denied",risk:"High",time:"09:31:52"},
    {id:"int_8f219",agent:"invoice-agent.testnet",destination:"payroll.near",amount:"120",purpose:"Contractor payout",status:"Authorized",risk:"Clear",time:"09:24:10"},
    {id:"int_8f218",agent:"growth-agent.testnet",destination:"campaigns.near",amount:"65",purpose:"Campaign placement",status:"Denied",risk:"Low",time:"Yesterday"},
    {id:"int_8f217",agent:"treasury-agent.testnet",destination:"ops-vault.near",amount:"250",purpose:"Operations reserve",status:"Authorized",risk:"Clear",time:"Yesterday"}
  ],
  decisions: [
    {id:"dec_7c91a",intent:"int_8f21c",agent:"treasury-agent.testnet",policy:"treasury-ops",destination:"merchant.near",amount:"85",result:"Authorized",reason:"All policy conditions passed",block:"128,443,921",time:"09:42:18"},
    {id:"dec_7c919",intent:"int_8f21b",agent:"research-agent.testnet",policy:"research-spend",destination:"compute.near",amount:"32",result:"Review",reason:"Risk signal requires human review",block:"128,443,810",time:"09:38:04"},
    {id:"dec_7c918",intent:"int_8f21a",agent:"treasury-agent.testnet",policy:"treasury-ops",destination:"unknown.near",amount:"410",result:"Denied",reason:"Destination is outside policy allowlist",block:"128,443,604",time:"09:31:52"},
    {id:"dec_7c917",intent:"int_8f219",agent:"invoice-agent.testnet",policy:"treasury-ops",destination:"payroll.near",amount:"120",result:"Authorized",reason:"All policy conditions passed",block:"128,443,501",time:"09:24:10"}
  ],
  risks: [
    {id:"risk-201",source:"Address reputation",subject:"compute.near",severity:"Medium",status:"Needs review",detail:"New destination with limited transaction history.",time:"09:38"},
    {id:"risk-202",source:"Destination screening",subject:"unknown.near",severity:"High",status:"Blocked",detail:"Destination is not in the policy allowlist.",time:"09:31"},
    {id:"risk-203",source:"Velocity monitor",subject:"treasury-agent.testnet",severity:"Low",status:"Cleared",detail:"Request frequency is within configured limits.",time:"09:24"}
  ],
  audit: [
    ["09:42:18","Authorization decision recorded","treasury-agent.testnet","dec_7c91a","success"],
    ["09:38:04","Risk review opened","research-agent.testnet","int_8f21b","review"],
    ["09:31:52","Request denied by destination scope","treasury-agent.testnet","int_8f21a","blocked"],
    ["09:24:10","Authorization decision recorded","invoice-agent.testnet","dec_7c917","success"],
    ["09:10:33","Agent key rotated","invoice-agent.testnet","key_••••d11a","info"],
    ["08:54:02","Policy version updated","treasury-ops","version 8","info"],
    ["Yesterday","Agent disabled","growth-agent.testnet","owner action","info"]
  ]
};

const icon = (name) => ({overview:"◫",policies:"▤",agents:"⌘",intents:"⇢",decisions:"◈",risk:"△",execution:"⌁",audit:"≋",settings:"⚙"}[name] || "◫");
const badge = (value) => {
  const v=String(value).toLowerCase();
  const tone=v.includes("authoriz")||v==="active"||v==="enabled"||v==="clear"||v==="cleared"||v==="success"?"green":v.includes("denied")||v.includes("blocked")||v==="high"||v==="paused"||v==="disabled"?"red":v.includes("review")||v==="medium"?"amber":"slate";
  return '<span class="status-badge '+tone+'"><i></i>'+value+'</span>';
};
const money = (n) => Number(n).toLocaleString("en-US")+" <small>units</small>";
const pageTitle = {overview:"Overview",policies:"Policies",agents:"Agents",intents:"Intents",decisions:"Decisions",risk:"Risk review",execution:"Execution",audit:"Audit log",settings:"Settings"};

function heading(kicker,title,desc,action=""){return '<div class="page-heading"><div><p class="eyebrow">'+kicker+'</p><h1>'+title+'</h1><p>'+desc+'</p></div>'+action+'</div>';}
function button(label,action,kind="primary",extra=""){return '<button class="btn '+kind+'" data-action="'+action+'" '+extra+'>'+label+'</button>';}
function panelTitle(title,sub="",right=""){return '<div class="panel-title"><div><h3>'+title+'</h3>'+(sub?'<p>'+sub+'</p>':"")+'</div>'+right+'</div>';}
function empty(){return '<div class="empty-state"><span>◌</span><b>Nothing to show</b><p>New records will appear here when the service is connected.</p></div>';}

function overview(){
 return heading("CONTROL CENTER","Spending, with boundaries.","A live-style view of the rules, agents, and decisions protecting autonomous spend.",button("+ create policy","new-policy"))+
 '<div class="metric-grid">'+
 metric("TOTAL POLICY BUDGET","6,600","Across 3 policies","↗ 2 active policies","mint")+
 metric("RESERVED / USED","2,054","31.1% of allocated budget","1,840 treasury · 214 research","blue")+
 metric("ACTIVE AGENTS","3","Out of 4 registered","1 agent currently disabled","violet")+
 metric("REQUESTS TODAY","24","18 authorized · 4 denied","2 need human review","amber")+
 '</div>'+
 '<section class="panel live-snapshot-panel" id="chain-snapshot">'+panelTitle("Finalized contract state","Live NEAR testnet reads · pinned to one block",'<button class="text-btn" data-action="refresh-live">↻ refresh</button>')+'<div class="live-snapshot-loading"><span class="live-pulse"></span> reading finalized contract state…</div></section>'+
 '<div class="overview-grid"><section class="panel span-2">'+panelTitle("Authorization activity","Request outcomes · preview data",'<span class="period-select">Last 7 days⌄</span>')+
 '<div class="chart-area"><div class="chart-y"><span>40</span><span>30</span><span>20</span><span>10</span><span>0</span></div><div class="chart"><div class="chart-grid"></div><div class="bars">'+[22,30,18,35,26,38,29].map((v,i)=>'<div class="bar-group"><div class="bar-stack"><i style="height:'+v*1.6+'px"></i><i style="height:'+(v*.5)*1.6+'px"></i><i style="height:'+(v*.22)*1.6+'px"></i></div><small>'+["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]+'</small></div>').join("")+'</div></div></div><div class="chart-legend"><span><i class="legend-green"></i>Authorized</span><span><i class="legend-amber"></i>Review</span><span><i class="legend-red"></i>Denied</span></div></section>'+
 '<section class="panel"><div class="panel-title"><div><h3>Decision breakdown</h3><p>Last 7 days</p></div><span class="tiny-tag">PREVIEW</span></div><div class="donut-wrap"><div class="donut"><div><b>86%</b><small>allowed</small></div></div><div class="donut-legend"><span><i class="legend-green"></i>Authorized <b>86</b></span><span><i class="legend-amber"></i>Review <b>8</b></span><span><i class="legend-red"></i>Denied <b>6</b></span></div></div></section>'+
 '<section class="panel span-2">'+panelTitle("Recent requests","Latest intent activity",'<button class="text-btn" data-page="intents">view all ↗</button>')+intentTable(state.intents.slice(0,4),false)+'</section>'+
 '<section class="panel"><div class="panel-title"><div><h3>Needs attention</h3><p>Items waiting for an owner</p></div>'+badge("2 open")+'</div><div class="attention-list"><div class="attention-item"><span class="attention-icon amber">!</span><div><b>Risk review pending</b><small>research-agent · 32 units</small></div><button class="arrow-btn" data-page="risk">→</button></div><div class="attention-item"><span class="attention-icon red">×</span><div><b>Destination blocked</b><small>unknown.near · policy violation</small></div><button class="arrow-btn" data-page="decisions">→</button></div></div></section></div>'+
 '<div class="section-caption">CORE CONTROLS</div><div class="quick-grid">'+quick("▤","Spending policies","Set limits, destinations, and expiry.","policies")+quick("⌘","Agent access","Manage identities and API keys.","agents")+quick("△","Risk screening","Review signals before authorization.","risk")+quick("⌁","Execution boundary","Inspect the signer and settlement gates.","execution")+'</div>';
}
function metric(label,value,sub,foot,tone){return '<article class="metric-card"><div class="metric-label">'+label+'<span class="metric-spark '+tone+'">↗</span></div><strong>'+value+'</strong><small>'+sub+'</small><div class="metric-foot">'+foot+'</div></article>';}
function quick(ic,title,desc,page){return '<button class="quick-card" data-page="'+page+'"><span>'+ic+'</span><b>'+title+'</b><small>'+desc+'</small><i>↗</i></button>';}
function intentTable(rows,showAgent=true){
 return '<div class="table-scroll"><table><thead><tr><th>INTENT</th>'+(showAgent?'<th>AGENT</th>':"")+'<th>DESTINATION</th><th>AMOUNT</th><th>RISK</th><th>STATUS</th><th></th></tr></thead><tbody>'+rows.map(r=>'<tr><td><b class="mono">'+r.id+'</b><small>'+r.purpose+'</small></td>'+(showAgent?'<td>'+r.agent+'</td>':"")+'<td>'+r.destination+'</td><td class="amount-cell">'+r.amount+' <small>units</small></td><td>'+badge(r.risk)+'</td><td>'+badge(r.status)+'</td><td><button class="row-more" data-detail="intent:'+r.id+'">···</button></td></tr>').join("")+'</tbody></table></div>';
}
function policies(){
 return heading("POLICY MANAGEMENT","Spending policies","Define the limits an agent must satisfy before a request can be authorized.",button("+ new policy","new-policy"))+
 '<div class="inline-stats"><span><b>3</b> total policies</span><span><b>2</b> active</span><span><b>6,600</b> total budget units</span><span><b>8</b> latest version</span></div>'+
 '<div class="panel"><div class="toolbar"><div class="searchbox">⌕ <input id="policy-search" placeholder="Search policies..." /></div><select id="policy-filter"><option>All policies</option><option>Active</option><option>Paused</option></select><span class="toolbar-spacer"></span><span class="tiny-tag">PREVIEW RECORDS</span></div><div id="policy-table">'+policyTable(state.policies)+'</div></div>'+
 '<div class="info-callout"><span>i</span><div><b>Contract enforcement</b><p>Policy scope, expiry, per-request limits, cumulative budget, and destination allowlists are enforced by the NEAR contract. The controls shown here are preview interactions until the authenticated owner API is connected.</p></div></div>';
}
function policyTable(rows){return rows.length?'<div class="table-scroll"><table><thead><tr><th>POLICY</th><th>STATUS</th><th>PER REQUEST</th><th>BUDGET USED</th><th>VERSION</th><th>EXPIRES</th><th></th></tr></thead><tbody>'+rows.map(p=>'<tr><td><b>'+p.name+'</b><small class="mono">'+p.id+' · '+p.scope+'</small></td><td>'+badge(p.status)+'</td><td>'+p.perTx+' <small>units</small></td><td><div class="budget-cell"><div class="progress"><i style="width:'+Math.round(Number(p.spent)/Number(p.budget)*100)+'%"></i></div><small>'+p.spent+' / '+p.budget+'</small></div></td><td><span class="version-pill">v'+p.version+'</span></td><td>'+p.expiry+'</td><td><button class="row-more" data-detail="policy:'+p.id+'">···</button></td></tr>').join("")+'</tbody></table></div>':empty();}
function agents(){
 return heading("IDENTITY & ACCESS","Agent registry","Give each autonomous agent a narrow identity, one policy, and revocable access.",button("+ register agent","new-agent"))+
 '<div class="inline-stats"><span><b>4</b> registered agents</span><span><b>3</b> enabled</span><span><b>4</b> scoped grants</span><span><b>0</b> unknown callers allowed</span></div>'+
 '<div class="panel"><div class="toolbar"><div class="searchbox">⌕ <input id="agent-search" placeholder="Search agents or account IDs..." /></div><select id="agent-filter"><option>All agents</option><option>Enabled</option><option>Disabled</option></select><span class="toolbar-spacer"></span><span class="tiny-tag">PREVIEW RECORDS</span></div><div id="agent-table">'+agentTable(state.agents)+'</div></div>'+
 '<div class="two-info"><div class="info-callout"><span>◇</span><div><b>Least-privilege grants</b><p>Every agent is bound to one policy. The contract checks the signer account on each authorization.</p></div></div><div class="info-callout"><span>!</span><div><b>Key lifecycle</b><p>Keys are stored as digests, can be rotated or revoked, and never appear in full after issuance.</p></div></div></div>';
}
function agentTable(rows){return rows.length?'<div class="table-scroll"><table><thead><tr><th>AGENT</th><th>POLICY</th><th>ACCESS</th><th>API KEY</th><th>LAST REQUEST</th><th>REQUESTS</th><th></th></tr></thead><tbody>'+rows.map(a=>'<tr><td><div class="agent-cell"><span class="agent-icon">⌘</span><span><b>'+a.name+'</b><small class="mono">'+a.account+'</small></span></div></td><td>'+a.policy+'</td><td>'+badge(a.status)+'</td><td><span class="mono key-mask">'+a.key+'</span></td><td>'+a.last+'</td><td>'+a.requests+'</td><td><button class="row-more" data-detail="agent:'+a.id+'">···</button></td></tr>').join("")+'</tbody></table></div>':empty();}
function intents(){
 return heading("REQUEST INTAKE","Spending intents","Inspect incoming requests, validate their shape, and see the policy decision path.",button("+ submit intent","new-intent"))+
 '<div class="inline-stats"><span><b>6</b> sample requests</span><span><b>3</b> authorized</span><span><b>2</b> denied</span><span><b>1</b> review required</span></div>'+
 '<div class="panel"><div class="toolbar"><div class="searchbox">⌕ <input id="intent-search" placeholder="Search intent, agent, destination..." /></div><select id="intent-filter"><option>All statuses</option><option>Authorized</option><option>Review</option><option>Denied</option></select><span class="toolbar-spacer"></span><span class="tiny-tag">SAMPLE REQUESTS</span></div><div id="intent-table">'+intentTable(state.intents,true)+'</div></div>'+
 '<div class="info-callout"><span>i</span><div><b>Request lifecycle</b><p>Authenticate agent → validate schema and idempotency → read one finalized policy snapshot → apply risk holds → ask the contract to authorize and reserve budget. A preflight result is advisory. The contract remains authoritative.</p></div></div>';
}
function decisions(){
 return heading("ON-CHAIN RECORDS","Decision history","Every authorization outcome, with the policy version and finalized block behind it.",'<button class="btn secondary" data-action="export-decisions">↓ export CSV</button>')+
 '<div class="inline-stats"><span><b>4</b> visible decisions</span><span><b>2</b> authorized</span><span><b>1</b> denied</span><span><b>1</b> review</span></div>'+
 '<div class="panel"><div class="toolbar"><div class="searchbox">⌕ <input id="decision-search" placeholder="Search decision or intent ID..." /></div><select id="decision-filter"><option>All outcomes</option><option>Authorized</option><option>Review</option><option>Denied</option></select><span class="toolbar-spacer"></span><span class="tiny-tag">PREVIEW + HISTORICAL</span></div><div id="decision-table">'+decisionTable(state.decisions)+'</div></div>'+
 '<div class="info-callout"><span>◇</span><div><b>Receipt integrity</b><p>Decision records should be checked against finalized contract views pinned to the same block. UI consistency checks are not independent cryptographic proofs, and authorization does not prove signing, broadcast, or settlement.</p></div></div>';
}
function decisionTable(rows){return rows.length?'<div class="table-scroll"><table><thead><tr><th>DECISION</th><th>INTENT</th><th>AGENT</th><th>DESTINATION</th><th>AMOUNT</th><th>OUTCOME</th><th>BLOCK</th><th></th></tr></thead><tbody>'+rows.map(d=>'<tr><td><b class="mono">'+d.id+'</b><small>'+d.time+'</small></td><td class="mono">'+d.intent+'</td><td>'+d.agent+'</td><td>'+d.destination+'</td><td>'+d.amount+' <small>units</small></td><td>'+badge(d.result)+'</td><td class="mono">'+d.block+'</td><td><button class="row-more" data-detail="decision:'+d.id+'">···</button></td></tr>').join("")+'</tbody></table></div>':empty();}
function risk(){
 return heading("RISK & POLICY GUARDRAILS","Risk review","Surface suspicious destinations, unusual activity, and missing evidence before execution.",'<span class="risk-summary">'+badge("2 require attention")+'</span>')+
 '<div class="risk-grid"><div class="risk-card red"><span>HIGH RISK</span><b>1</b><small>Blocked by policy</small></div><div class="risk-card amber"><span>REVIEW QUEUE</span><b>1</b><small>Owner decision needed</small></div><div class="risk-card green"><span>CLEARED</span><b>1</b><small>Within configured limits</small></div></div>'+
 '<div class="panel"><div class="panel-title"><div><h3>Signal review queue</h3><p>Risk signals are evidence inputs, never spending authorization.</p></div><span class="tiny-tag">SAMPLE SIGNALS</span></div><div class="risk-list">'+state.risks.map(r=>'<article class="risk-row"><span class="risk-symbol '+r.severity.toLowerCase()+'">'+(r.severity==="High"?"!":"△")+'</span><div class="risk-main"><div><b>'+r.source+'</b><span class="mono">'+r.id+'</span></div><p>'+r.detail+'</p><small>'+r.subject+' · '+r.time+'</small></div><div class="risk-end">'+badge(r.severity)+'<span class="muted">'+r.status+'</span>'+(r.status==="Needs review"?'<button class="btn small secondary" data-action="review-risk" data-id="'+r.id+'">review</button>':'')+'</div></article>').join("")+'</div></div>'+
 '<div class="two-info"><div class="info-callout"><span>✓</span><div><b>Deterministic risk rules</b><p>Signal signatures, evidence hashes, freshness, duplicates, contradictions, and trusted source keys are validated by the policy library.</p></div></div><div class="info-callout"><span>!</span><div><b>Live provider not connected</b><p>These sample signals do not come from a live external provider. Required provider failures must block preflight, never silently clear risk.</p></div></div></div>';
}
function execution(){
 return heading("SIGNING & SETTLEMENT","Execution boundary","Inspect the path from an approved decision to a constrained transaction. Signing stays locked until trust is proven.",'<span class="locked-chip">◇ SIGNER DISABLED</span>')+
 '<div class="execution-banner"><span class="lock-large">⌑</span><div><b>Execution is not enabled</b><p>Outlay currently authorizes intent and reserves policy budget. It does not sign, broadcast, transfer assets, or claim settlement.</p></div></div>'+
 '<div class="pipeline">'+[['01','Intent received','Schema + identity'],['02','Policy authorized','NEAR contract'],['03','Evidence verified','not implemented'],['04','Payload validated','validator only'],['05','Transaction signed','locked'],['06','Settlement observed','not implemented']].map((x,i)=>'<div class="pipe-step '+(i<2?"done":i===3?"partial":"locked")+'"><span class="pipe-number">'+x[0]+'</span><b>'+x[1]+'</b><small>'+x[2]+'</small><i>'+(i<2?"✓":i===3?"◐":"·")+'</i></div>').join("")+'</div>'+
 '<div class="execution-grid"><section class="panel">'+panelTitle("Trusted authorization evidence","Required before an envelope can be constructed")+'<div class="checklist">'+[['Decision exists at finalized block',true],['Policy and agent grant match',false],['Reservation is active and unreleased',false],['Nonce and intent are unused',false],['Block hash is consistent across reads',false],['Explicit asset mapping is approved',false]].map(([t,ok])=>'<div><span class="'+(ok?"check-ok":"check-pending")+'">'+(ok?"✓":"·")+'</span>'+t+badge(ok?"implemented":"not ready")+'</div>').join("")+'</div></section><section class="panel">'+panelTitle("Execution envelope","Illustrative shape only")+'<pre class="code-preview">'+JSON.stringify({schemaVersion:1,network:"near-testnet",decisionId:"dec_7c91a",authorizationBlock:{height:"128443921",hash:"pending trusted read"},asset:"UNMAPPED",recipient:"merchant.near",amount:"UNMAPPED",actions:["transfer"]},null,2)+'</pre><p class="micro-note">No transaction is constructed or signed. policy-unit cannot be converted into a real asset amount.</p></section></div>'+
 '<div class="info-callout danger-callout"><span>!</span><div><b>Security gate</b><p>Do not connect a signer until the trusted evidence adapter, explicit asset denomination, reservation cancellation semantics, replay protection, signer payload tests, and independent review are complete.</p></div></div>';
}
function audit(){
 return heading("ACCOUNTABILITY","Audit log","A chronological record of access, policy changes, request outcomes, and operator actions.",'<button class="btn secondary" data-action="export-audit">↓ export log</button>')+
 '<div class="inline-stats"><span><b>7</b> visible events</span><span><b>3</b> authorization events</span><span><b>1</b> key lifecycle event</span><span><b>1</b> policy update</span></div>'+
 '<div class="panel"><div class="toolbar"><div class="searchbox">⌕ <input id="audit-search" placeholder="Search events, actors, references..." /></div><select id="audit-filter"><option>All event types</option><option>Authorization</option><option>Access</option><option>Policy</option></select><span class="toolbar-spacer"></span><span class="tiny-tag">SAMPLE AUDIT DATA</span></div><div id="audit-table">'+auditTable(state.audit)+'</div></div>'+
 '<div class="info-callout"><span>◇</span><div><b>Append-only evidence</b><p>Production audit records should be persisted with actor identity, request correlation ID, timestamps, before/after values, and transaction references. Never log raw API keys or secrets.</p></div></div>';
}
function auditTable(rows){return '<div class="audit-list">'+rows.map((r,i)=>'<div class="audit-row"><span class="audit-line"><i></i></span><time>'+r[0]+'</time><span class="audit-event-icon">'+(r[4]==="success"?"✓":r[4]==="blocked"?"×":r[4]==="review"?"△":"·")+'</span><div><b>'+r[1]+'</b><small>'+r[2]+'</small></div><span class="mono audit-ref">'+r[3]+'</span><span class="audit-state '+r[4]+'">'+r[4]+'</span></div>').join("")+'</div>';}
function settings(){
 return heading("CONFIGURATION","Workspace settings","Review the network, service connections, security boundaries, and environment.",'')+
 '<div class="settings-grid"><section class="panel">'+panelTitle("Network configuration","Read-only environment settings")+
 '<div class="settings-fields">'+setting("Network","NEAR testnet","Connected target") +setting("Contract account","outlay-deployer.testnet","Authorization contract") +setting("Agent example","outlay-agent.testnet","Registered test identity")+setting("RPC endpoint","rpc.testnet.fastnear.com","Public finalized RPC")+'</div></section>'+
 '<section class="panel">'+panelTitle("Service connections","Required infrastructure")+
 '<div class="connection-list">'+connection("Authorization contract","Available in source · testnet state not re-verified","warning")+connection("Policy API","Not deployed","off")+connection("PostgreSQL","Not provisioned for production","off")+connection("Risk provider","No live provider configured","off")+connection("Signer adapter","Intentionally disabled","locked")+'</div></section>'+
 '<section class="panel">'+panelTitle("Security posture","Current implementation boundaries")+
 '<div class="settings-fields">'+setting("Authentication","Agent API keys","Digest-only storage design") +setting("Authorization","On-chain policy checks","Contract is authoritative") +setting("Amounts","policy-unit","No asset denomination mapping") +setting("Execution","Disabled","No signing or transfer")+'</div></section>'+
 '<section class="panel">'+panelTitle("Workspace actions","Owner controls")+
 '<div class="settings-action"><div><b>Export workspace data</b><small>Download preview records as JSON.</small></div><button class="btn secondary" data-action="export-json">export</button></div><div class="settings-action"><div><b>Reset preview workspace</b><small>Restore the original sample state.</small></div><button class="btn danger-outline" data-action="reset-preview">reset</button></div></section></div>';
}
function setting(label,value,sub){return '<div class="setting-row"><span>'+label+'<small>'+sub+'</small></span><b>'+value+'</b></div>';}
function connection(name,desc,status){return '<div class="connection-row"><span class="connection-indicator '+status+'"></span><div><b>'+name+'</b><small>'+desc+'</small></div>'+badge(status==="warning"?"verify":status==="off"?"offline":status==="locked"?"disabled":"connected")+'</div>';}


function pageSupplement(){
 const blocks={
  overview:()=>'<div class="section-caption">HOW OUTLAY WORKS</div><div class="quick-grid">'+quick("01","Define authority","Create a policy with a hard budget, per-request cap, expiry, and destination allowlist.","policies")+quick("02","Bind an identity","Register an agent and bind it to one narrowly scoped grant.","agents")+quick("03","Evaluate every intent","Validate identity, replay protection, policy limits, and risk evidence.","intents")+quick("04","Verify the outcome","Inspect the finalized decision and its reservation state.","decisions")+'</div><div class="info-callout"><span>i</span><div><b>Preview data notice</b><p>All metrics and activity above are illustrative workspace records. The live inspector is the separate source for finalized testnet contract state.</p></div></div>',
  policies:()=>'<div class="section-caption">POLICY DESIGN CHECKLIST</div><div class="quick-grid">'+quick("01","Identity scope","Bind each grant to the intended agent account and policy.","agents")+quick("02","Spend ceiling","Set both a per-intent maximum and a cumulative budget.","policies")+quick("03","Destination scope","Use exact account IDs. Avoid broad or wildcard destinations.","policies")+quick("04","Expiry and version","Set a short expiry and review every policy version change.","audit")+'</div><div class="info-callout"><span>!</span><div><b>Policy changes need owner authorization</b><p>A production form must validate the complete policy, show the before-and-after diff, require explicit owner authentication, submit the contract call, and refresh finalized state before reporting success.</p></div></div>',
  agents:()=>'<div class="section-caption">AGENT ACCESS LIFECYCLE</div><div class="pipeline">'+[['01','Create identity','Validate NEAR account'],['02','Bind policy','One explicit grant'],['03','Issue credential','Show secret once'],['04','Monitor usage','Rate and anomaly checks'],['05','Rotate or revoke','Invalidate old digest']].map((x,i)=>'<div class="pipe-step '+(i<3?"done":"locked")+'"><span class="pipe-number">'+x[0]+'</span><b>'+x[1]+'</b><small>'+x[2]+'</small><i>'+(i<3?"✓":"·")+'</i></div>').join("")+'</div><div class="info-callout"><span>!</span><div><b>Credential handling</b><p>Full API secrets must never be placed in the browser database, audit log, URL, or analytics. Issue once, store only a strong digest, support rotation, and make revocation immediate.</p></div></div>',
  intents:()=>'<div class="section-caption">INTENT EVALUATION PATH</div><div class="pipeline">'+[['01','Authenticate','Agent credential'],['02','Validate','Schema and replay key'],['03','Load policy','Finalized policy snapshot'],['04','Screen risk','Trusted evidence inputs'],['05','Authorize','Contract decision + reserve']].map((x,i)=>'<div class="pipe-step '+(i<2?"done":"partial")+'"><span class="pipe-number">'+x[0]+'</span><b>'+x[1]+'</b><small>'+x[2]+'</small><i>'+(i<2?"✓":"◐")+'</i></div>').join("")+'</div><div class="info-callout"><span>i</span><div><b>Required request fields</b><p>Agent identity, unique intent ID, monotonic nonce, destination account, positive integer amount in policy units, purpose, and an explicit request timestamp. Asset denomination must remain separate from policy units.</p></div></div>',
  decisions:()=>'<div class="section-caption">DECISION RECEIPT CONTENTS</div><div class="settings-grid"><section class="panel">'+panelTitle("Authorization evidence","Fields required for an independently checkable receipt")+'<div class="checklist">'+["Decision ID and intent ID","Agent account and grant version","Policy ID and policy version","Destination and authorized amount","Finalized block height and block hash","Reservation state at the same block","Contract transaction reference"].map(x=>'<div><span class="check-pending">·</span>'+x+badge("required")+'</div>').join("")+'</div></section><section class="panel">'+panelTitle("What the receipt proves","Keep claims within the evidence")+'<div class="settings-fields">'+setting("Authorization","Contract accepted the intent","Only after finalized decision read") +setting("Budget","Reservation recorded","Check release state separately") +setting("Signing","Not proven","Requires signer evidence") +setting("Settlement","Not proven","Requires independent transfer evidence")+'</div></section></div>',
  risk:()=>'<div class="section-caption">EVIDENCE QUALITY REVIEW</div><div class="settings-grid"><section class="panel">'+panelTitle("Signal validation","Before a signal can influence a decision")+'<div class="checklist">'+["Trusted source identity and key","Signature verification","Evidence timestamp and freshness","Subject matches the requested destination","Duplicate and replay detection","Contradictory signal handling","Provider outage fails closed"].map(x=>'<div><span class="check-pending">·</span>'+x+badge("required")+'</div>').join("")+'</div></section><section class="panel">'+panelTitle("Review outcomes","Owner action must be explicit")+'<div class="settings-fields">'+setting("Clear","Evidence reviewed and acceptable","Does not override contract policy") +setting("Hold","Keep request blocked","Wait for fresh evidence") +setting("Escalate","Require a second reviewer","For high-impact or conflicting signals") +setting("Reject","Record reason and evidence","Never silently discard the signal")+'</div></section></div>',
  execution:()=>'<div class="section-caption">RELEASE GATES</div><div class="settings-grid"><section class="panel">'+panelTitle("Implementation gates","All must pass before signer integration")+'<div class="checklist">'+["Trusted finalized-state adapter","Same-block evidence consistency","Reservation cancellation and release rules","Replay and nonce protection tests","Asset and decimal mapping allowlist","Canonical transaction payload validator","Signer policy and key isolation","Broadcast and settlement reconciliation"].map(x=>'<div><span class="check-pending">·</span>'+x+badge("blocked")+'</div>').join("")+'</div></section><section class="panel">'+panelTitle("Allowed now","Current safe product boundary")+'<div class="settings-fields">'+setting("Policy evaluation","Implemented in contract","Authorization remains authoritative") +setting("Budget reservation","Contract capability","Verify finalized state") +setting("Transaction signing","Disabled","No signer connected") +setting("Token transfer","Out of scope","No settlement claim")+'</div></section></div>',
  audit:()=>'<div class="section-caption">AUDIT EVENT MODEL</div><div class="settings-grid"><section class="panel">'+panelTitle("Events to retain","Append-only production record")+'<div class="checklist">'+["Policy created, updated, paused, resumed","Agent grant created, rotated, revoked","Intent received and validation result","Risk evidence accepted, rejected, or stale","Contract decision and transaction reference","Reservation release or expiry","Owner authentication and configuration changes"].map(x=>'<div><span class="check-pending">·</span>'+x+badge("event")+'</div>').join("")+'</div></section><section class="panel">'+panelTitle("Required metadata","For every event")+'<div class="settings-fields">'+setting("Actor","Authenticated principal","Never trust a client-supplied actor") +setting("Correlation","Request and intent IDs","Trace one action end to end") +setting("Change record","Before and after values","Redact secrets and credentials") +setting("Time and chain","UTC timestamp + block reference","Keep chain evidence distinct")+'</div></section></div>',
  settings:()=>'<div class="section-caption">ENVIRONMENT READINESS</div><div class="panel">'+panelTitle("Deployment checklist","Infrastructure still required for a production workspace")+'<div class="checklist">'+["Provision managed PostgreSQL and apply migrations","Deploy API with required secrets","Verify owner authentication and authorization","Connect a trusted risk evidence provider","Configure monitoring, alerting, and backups","Run testnet smoke and failure-mode tests","Review signer boundary independently"].map(x=>'<div><span class="check-pending">·</span>'+x+badge("not complete")+'</div>').join("")+'</div></div>'
 };
 return blocks[state.page]?.()||"";
}

function render(){
 $("#page-crumb").textContent=pageTitle[state.page];
 $$(".nav-item").forEach(n=>n.classList.toggle("active",n.dataset.page===state.page));
 const view={overview,policies,agents,intents,decisions,risk,execution,audit,settings}[state.page]()+pageSupplement();
 $("#page-content").innerHTML=view;
 bindFilters();
 if(state.page==="overview") refreshContractSnapshot();
}

let liveSnapshotSequence=0;
function safeText(value){
 return String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
async function refreshContractSnapshot(showToast=false){
 const panel=$("#chain-snapshot");
 if(!panel)return;
 const sequence=++liveSnapshotSequence;
 const refresh=panel.querySelector('[data-action="refresh-live"]');
 if(refresh){refresh.disabled=true;refresh.textContent="↻ refreshing";}
 try{
  const snapshot=await loadContractSnapshot();
  if(sequence!==liveSnapshotSequence||!$("#chain-snapshot"))return;
  const policy=snapshot.policy;
  const grant=snapshot.grant;
  const stateLabel=policy?(policy.enabled?"enabled":"disabled"):"not found";
  const agentLabel=grant?(grant.enabled?"enabled":"disabled"):"not found";
  panel.innerHTML='<div class="panel-title"><div><h3>Finalized contract state</h3><p>Live NEAR testnet reads · one consistent finalized block</p></div><button class="text-btn" data-action="refresh-live">↻ refresh</button></div>'+
   '<div class="live-snapshot-grid">'+
   '<div><small>DECISIONS RECORDED</small><strong>'+safeText(snapshot.decisionCount)+'</strong><em>contract counter</em></div>'+
   '<div><small>POLICY · '+safeText(snapshot.policyId)+'</small><strong>'+safeText(stateLabel)+'</strong><em>version '+safeText(snapshot.policyVersion)+'</em></div>'+
   '<div><small>RESERVED BUDGET</small><strong>'+safeText(snapshot.reserved)+' <i>units</i></strong><em>of '+safeText(policy?.max_total??"unknown")+' total units</em></div>'+
   '<div><small>AGENT · '+safeText(snapshot.agentId)+'</small><strong>'+safeText(agentLabel)+'</strong><em>grant bound to '+safeText(grant?.policy_id??"no policy")+'</em></div>'+
   '</div><div class="live-snapshot-foot"><span><i></i> FINALIZED SNAPSHOT</span><span>BLOCK '+safeText(snapshot.blockHeight)+' · '+safeText(snapshot.blockHash.slice(0,12))+'…</span><a href="./live.html">inspect full contract ↗</a></div>';
  if(showToast)toast("Finalized NEAR contract state refreshed.");
 }catch(error){
  if(sequence!==liveSnapshotSequence||!$("#chain-snapshot"))return;
  panel.innerHTML='<div class="panel-title"><div><h3>Finalized contract state</h3><p>Live NEAR testnet reads · read-only</p></div><button class="text-btn" data-action="refresh-live">↻ retry</button></div><div class="live-snapshot-error"><b>Live state unavailable</b><p>'+safeText(error?.message||"Could not read the contract.")+'</p><a href="./live.html">open contract inspector ↗</a></div>';
  if(showToast)toast("Could not refresh contract state. See the live inspector for details.");
 }
}

function bindFilters(){
 const bind=(id,filter,draw)=>{const el=$("#"+id);if(el){el.addEventListener("input",draw);el.addEventListener("change",draw);}};
 bind("policy-search",null,()=>$("#policy-table").innerHTML=policyTable(state.policies.filter(p=>(p.name+p.id+p.scope).toLowerCase().includes($("#policy-search").value.toLowerCase())&&($("#policy-filter").value==="All policies"||p.status===$("#policy-filter").value))));
 bind("policy-filter",null,()=>$("#policy-table").innerHTML=policyTable(state.policies.filter(p=>(p.name+p.id+p.scope).toLowerCase().includes(($("#policy-search")?.value||"").toLowerCase())&&($("#policy-filter").value==="All policies"||p.status===$("#policy-filter").value))));
 bind("agent-search",null,()=>$("#agent-table").innerHTML=agentTable(state.agents.filter(a=>(a.name+a.account+a.policy).toLowerCase().includes($("#agent-search").value.toLowerCase())&&($("#agent-filter").value==="All agents"||a.status===$("#agent-filter").value))));
 bind("agent-filter",null,()=>$("#agent-table").innerHTML=agentTable(state.agents.filter(a=>(a.name+a.account+a.policy).toLowerCase().includes(($("#agent-search")?.value||"").toLowerCase())&&($("#agent-filter").value==="All agents"||a.status===$("#agent-filter").value))));
 bind("intent-search",null,()=>$("#intent-table").innerHTML=intentTable(state.intents.filter(a=>(a.id+a.agent+a.destination+a.purpose).toLowerCase().includes($("#intent-search").value.toLowerCase())&&($("#intent-filter").value==="All statuses"||a.status===$("#intent-filter").value)),true));
 bind("intent-filter",null,()=>$("#intent-table").innerHTML=intentTable(state.intents.filter(a=>(a.id+a.agent+a.destination+a.purpose).toLowerCase().includes(($("#intent-search")?.value||"").toLowerCase())&&($("#intent-filter").value==="All statuses"||a.status===$("#intent-filter").value)),true));
 bind("decision-search",null,()=>$("#decision-table").innerHTML=decisionTable(state.decisions.filter(a=>(a.id+a.intent+a.agent+a.destination).toLowerCase().includes($("#decision-search").value.toLowerCase())&&($("#decision-filter").value==="All outcomes"||a.result===$("#decision-filter").value))));
 bind("decision-filter",null,()=>$("#decision-table").innerHTML=decisionTable(state.decisions.filter(a=>(a.id+a.intent+a.agent+a.destination).toLowerCase().includes(($("#decision-search")?.value||"").toLowerCase())&&($("#decision-filter").value==="All outcomes"||a.result===$("#decision-filter").value))));
 bind("audit-search",null,()=>$("#audit-table").innerHTML=auditTable(state.audit.filter(a=>a.join(" ").toLowerCase().includes($("#audit-search").value.toLowerCase()))));
 bind("audit-filter",null,()=>{
  const query=($("#audit-search")?.value||"").toLowerCase();
  const kind=$("#audit-filter").value;
  const rows=state.audit.filter(row=>{
   const searchable=row.join(" ").toLowerCase();
   const typeMatch=kind==="All event types"||
    (kind==="Authorization"&&searchable.includes("authorization"))||
    (kind==="Access"&&(searchable.includes("agent")||searchable.includes("key")))||
    (kind==="Policy"&&searchable.includes("policy"));
   return searchable.includes(query)&&typeMatch;
  });
  $("#audit-table").innerHTML=auditTable(rows);
 });
}

function openModal(title,eyebrow,body){$("#modal-title").textContent=title;$("#modal-eyebrow").textContent=eyebrow;$("#modal-body").innerHTML=body;$("#modal-layer").hidden=false;document.body.classList.add("modal-open");}
function closeModal(){$("#modal-layer").hidden=true;document.body.classList.remove("modal-open");}
function field(label,name,placeholder="",type="text",value=""){return '<label class="form-field">'+label+'<input name="'+name+'" type="'+type+'" placeholder="'+placeholder+'" value="'+value+'" required></label>';}
function newPolicy(){openModal("Create spending policy","POLICY CONFIGURATION",'<form id="policy-form"><div class="form-grid">'+field("Policy name","name","e.g. Vendor operations")+field("Policy ID","id","vendor-ops")+field("Max per request · units","perTx","250","number")+field("Total budget · units","budget","5000","number")+field("Expires on","expiry","","date")+'<label class="form-field full">Allowed destinations <textarea name="destinations" placeholder="one.near, two.near" required></textarea><small>Separate account IDs with commas. Only listed destinations can pass policy scope.</small></label></div><div class="modal-foot"><span class="micro-note">Preview only · no contract call</span><button type="button" class="btn secondary" data-close-modal>cancel</button><button class="btn primary">add policy preview</button></div></form>');}
function newAgent(){openModal("Register an agent","IDENTITY & ACCESS",'<form id="agent-form"><div class="form-grid">'+field("Agent display name","name","e.g. Procurement agent")+field("NEAR account ID","account","agent.testnet")+'<label class="form-field full">Bound policy<select name="policy">'+state.policies.map(p=>'<option value="'+p.id+'">'+p.name+' · '+p.id+'</option>').join("")+'</select></label><label class="form-field full">Access note<input name="note" placeholder="What should this agent do?"></label></div><div class="modal-foot"><span class="micro-note">Preview only · key not issued</span><button type="button" class="btn secondary" data-close-modal>cancel</button><button class="btn primary">add agent preview</button></div></form>');}
function newIntent(){openModal("Submit spending intent","REQUEST INTAKE",'<form id="intent-form"><div class="form-grid"><label class="form-field full">Agent identity<select name="agent">'+state.agents.filter(a=>a.status==="Enabled").map(a=>'<option>'+a.account+'</option>').join("")+'</select></label>'+field("Destination account","destination","merchant.near")+field("Amount · policy units","amount","25","number")+field("Intent reference","intent","invoice-2049")+field("Nonce","nonce","18","number")+'<label class="form-field full">Purpose / reason<textarea name="purpose" placeholder="Describe why this spend is needed" required></textarea></label></div><div class="info-callout compact"><span>i</span><div><b>Preflight simulation only</b><p>This preview will not contact the API, consume a nonce, reserve budget, or create an on-chain decision.</p></div></div><div class="modal-foot"><span class="micro-note">No transaction will be sent</span><button type="button" class="btn secondary" data-close-modal>cancel</button><button class="btn primary">simulate request</button></div></form>');}
function detail(type,id){
 const obj={policy:state.policies.find(x=>x.id===id),agent:state.agents.find(x=>x.id===id),intent:state.intents.find(x=>x.id===id),decision:state.decisions.find(x=>x.id===id)}[type];if(!obj)return;
 const title={policy:"Policy details",agent:"Agent details",intent:"Intent details",decision:"Decision receipt"}[type];
 const rows=Object.entries(obj).map(([k,v])=>'<div class="detail-row"><span>'+k.replaceAll("_"," ")+'</span><b>'+(Array.isArray(v)?v.join(", "):String(v))+'</b></div>').join("");
 const actions=type==="policy"?'<button class="btn secondary" data-action="toggle-policy" data-id="'+id+'">'+(obj.status==="Active"?"pause policy":"resume policy")+'</button>':type==="agent"?'<button class="btn secondary" data-action="toggle-agent" data-id="'+id+'">'+(obj.status==="Enabled"?"disable agent":"enable agent")+'</button>':"";
 openModal(title,"RECORD INSPECTOR",'<div class="detail-list">'+rows+'</div><div class="modal-foot"><span class="micro-note">Preview record · not chain state</span>'+actions+'<button class="btn primary" data-close-modal>close</button></div>');
}
function toast(message){const node=document.createElement("div");node.className="toast";node.textContent=message;$("#toast-stack").append(node);setTimeout(()=>node.remove(),3200);}
function download(name,content,type="text/csv"){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
function exportRows(rows){return rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(",")).join("\n");}
function handleAction(action,id){
 if(action==="refresh-live")return refreshContractSnapshot(true);
 if(action==="new-policy")return newPolicy();
 if(action==="new-agent")return newAgent();
 if(action==="new-intent")return newIntent();
 if(action==="toggle-policy"){const p=state.policies.find(x=>x.id===id);p.status=p.status==="Active"?"Paused":"Active";closeModal();render();return toast("Preview policy state updated. No transaction sent.");}
 if(action==="toggle-agent"){const a=state.agents.find(x=>x.id===id);a.status=a.status==="Enabled"?"Disabled":"Enabled";closeModal();render();return toast("Preview agent access updated. No transaction sent.");}
 if(action==="review-risk"){const r=state.risks.find(x=>x.id===id);openModal("Review risk signal","OWNER REVIEW",'<div class="detail-list"><div class="detail-row"><span>Signal</span><b>'+r.source+'</b></div><div class="detail-row"><span>Subject</span><b>'+r.subject+'</b></div><div class="detail-row"><span>Evidence</span><b>'+r.detail+'</b></div></div><div class="modal-foot"><span class="micro-note">Preview only · no risk provider action</span><button class="btn secondary" data-close-modal>close</button><button class="btn primary" data-action="mark-reviewed" data-id="'+id+'">mark reviewed</button></div>');return;}
 if(action==="mark-reviewed"){const r=state.risks.find(x=>x.id===id);r.status="Reviewed";closeModal();render();return toast("Marked reviewed in preview only.");}
 if(action==="export-decisions")return download("outlay-decisions-preview.csv",exportRows([["decision","intent","agent","policy","destination","amount","result","block"],...state.decisions.map(d=>[d.id,d.intent,d.agent,d.policy,d.destination,d.amount,d.result,d.block])]));
 if(action==="export-audit")return download("outlay-audit-preview.csv",exportRows([["time","event","actor","reference","status"],...state.audit]));
 if(action==="export-json")return download("outlay-workspace-preview.json",JSON.stringify(state,null,2),"application/json");
 if(action==="reset-preview"){if(confirm("Reset all preview records to their original sample state?")){location.reload();}return;}
}
document.addEventListener("click",e=>{
 const page=e.target.closest("[data-page]");if(page){state.page=page.dataset.page;$("#sidebar").classList.remove("mobile-open");render();return;}
 const action=e.target.closest("[data-action]");if(action){handleAction(action.dataset.action,action.dataset.id);return;}
 const detailBtn=e.target.closest("[data-detail]");if(detailBtn){const [type,id]=detailBtn.dataset.detail.split(":");detail(type,id);return;}
 if(e.target.closest("[data-close-modal]"))closeModal();
});
document.addEventListener("submit",e=>{
 e.preventDefault();const form=e.target;const data=Object.fromEntries(new FormData(form));
 if(form.id==="policy-form"){
  const id=data.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g,"-");if(state.policies.some(p=>p.id===id))return toast("That policy ID already exists in this preview.");
  state.policies.push({id,name:data.name,status:"Active",scope:"Custom · Preview",perTx:data.perTx,budget:data.budget,spent:"0",version:1,expiry:data.expiry,destinations:data.destinations.split(",").map(x=>x.trim()).filter(Boolean)});
  closeModal();state.page="policies";render();toast("Policy added to preview. No contract transaction was sent.");
 }
 if(form.id==="agent-form"){
  if(state.agents.some(a=>a.account===data.account))return toast("That account is already in the preview registry.");
  state.agents.push({id:"agent-"+Date.now(),name:data.name,account:data.account,policy:data.policy,status:"Enabled",key:"not issued · preview",last:"Never",requests:0});
  closeModal();state.page="agents";render();toast("Agent added to preview. No on-chain grant or API key was created.");
 }
 if(form.id==="intent-form"){
  const amount=Number(data.amount);if(!Number.isSafeInteger(amount)||amount<=0)return toast("Enter a positive whole-number amount.");
  const policy=state.policies.find(p=>p.id===state.agents.find(a=>a.account===data.agent)?.policy);
  const allowed=policy?.destinations.includes(data.destination);
  const result=!policy?"Denied":!allowed?"Denied":amount>Number(policy.perTx)||amount+Number(policy.spent)>Number(policy.budget)?"Denied":"Review";
  state.intents.unshift({id:"preview_"+Math.random().toString(16).slice(2,8),agent:data.agent,destination:data.destination,amount:String(amount),purpose:data.purpose,status:result,risk:allowed?"Medium":"High",time:"Just now"});
  closeModal();state.page="intents";render();toast("Local simulation complete: "+result+". No API call, nonce use, or chain decision.");
 }
});
$("#mobile-menu").addEventListener("click",()=>$("#sidebar").classList.toggle("mobile-open"));
$("#notifications").addEventListener("click",()=>toast("You're all caught up in this preview."));
$("#modal-layer").addEventListener("click",e=>{if(e.target.dataset.closeModal!==undefined)closeModal();});
render();
initializeWallet();

// First-visit splash: keep the intro out of the way after the visitor enters.
const splash=$("#splash-screen");
function enterWorkspace(){
 if(!splash)return;
 splash.classList.add("is-leaving");
 try{sessionStorage.setItem("outlay-intro-seen","1");}catch{}
 window.setTimeout(()=>splash.remove(),700);
}
if(splash){
 let seen=false;
 try{seen=sessionStorage.getItem("outlay-intro-seen")==="1";}catch{}
 if(seen)splash.remove();
 else{
  $("#enter-workspace")?.addEventListener("click",enterWorkspace);
  $("#skip-splash")?.addEventListener("click",enterWorkspace);
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&document.body.contains(splash))enterWorkspace();});
 }
}
