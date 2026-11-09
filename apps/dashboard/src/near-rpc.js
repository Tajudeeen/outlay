import { callView } from "./near-rpc.js";

const byId = (id) => document.getElementById(id);
const setText = (id, value) => { byId(id).textContent = value ?? "--"; };
const pretty = (id, value) => { byId(id).textContent = JSON.stringify(value, null, 2); };

function formatUnits(value) {
  if (value === null || value === undefined) return "--";
  try { return BigInt(value).toLocaleString() + " units"; }
  catch { return String(value) + " units"; }
}

function setBadge(id, label, tone = "") {
  const node = byId(id);
  node.textContent = label;
  node.className = "badge" + (tone ? " " + tone : "");
}

function formatTimestamp(value) {
  if (!value) return "--";
  try {
    const milliseconds = Number(BigInt(value) / 1_000_000n);
    return new Date(milliseconds).toLocaleString();
  } catch { return String(value); }
}

async function refresh() {
  const button = byId("refresh-button");
  const contractId = byId("contract-id").value.trim();
  const policyId = byId("policy-id").value.trim();
  const agentId = byId("agent-id").value.trim();
  const decisionId = byId("decision-id").value.trim();
  const errorPanel = byId("error-panel");

  if (!contractId || !policyId || !agentId || !decisionId) {
    errorPanel.hidden = false;
    setText("error-message", "Fill in the contract, policy, agent, and decision identifiers.");
    return;
  }

  button.disabled = true;
  button.textContent = "querying finalized state…";
  errorPanel.hidden = true;
  setText("connection-state", "querying testnet");

  try {
    const results = await Promise.all([
      callView(contractId, "get_decision_count"),
      callView(contractId, "get_policy", { policy_id: policyId }),
      callView(contractId, "get_policy_version", { policy_id: policyId }),
      callView(contractId, "get_policy_spend", { policy_id: policyId }),
      callView(contractId, "get_agent_grant", { agent_id: agentId }),
      callView(contractId, "get_decision", { decision_id: decisionId }),
    ]);

    const [countResult, policyResult, versionResult, spendResult, grantResult, decisionResult] = results;
    const policy = policyResult.value;
    const grant = grantResult.value;
    const decision = decisionResult.value;
    const blockHeights = results.map((result) => result.blockHeight).filter(Boolean);
    const highestBlock = blockHeights.length ? Math.max(...blockHeights) : null;

    setText("decision-count", countResult.value ?? "0");
    setText("reserved-budget", formatUnits(spendResult.value ?? "0"));
    setText("policy-version", versionResult.value ?? "0");
    setText("agent-state", grant ? (grant.enabled ? "enabled" : "disabled") : "unregistered");
    setText("agent-policy", grant ? "bound to " + grant.policy_id : "no policy grant");

    setBadge("policy-badge", policy ? (policy.enabled ? "enabled" : "disabled") : "not found", policy ? (policy.enabled ? "good" : "bad") : "");
    setText("max-per-tx", policy ? formatUnits(policy.max_per_transaction) : "--");
    setText("max-total", policy ? formatUnits(policy.max_total) : "--");
    setText("policy-expiry", policy ? formatTimestamp(policy.expires_at_ns) : "--");
    setText("destination-count", policy ? String(policy.allowed_destinations.length) + " destinations" : "0 destinations");

    const destinationRoot = byId("destinations");
    destinationRoot.replaceChildren();
    if (policy?.allowed_destinations?.length) {
      for (const destination of policy.allowed_destinations) {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = destination;
        destinationRoot.append(chip);
      }
    } else {
      const empty = document.createElement("span");
      empty.className = "muted";
      empty.textContent = "No destinations configured.";
      destinationRoot.append(empty);
    }
    pretty("policy-json", policy);

    setText("grant-agent", agentId);
    setBadge("grant-badge", grant ? (grant.enabled ? "active grant" : "disabled grant") : "no grant", grant ? (grant.enabled ? "good" : "bad") : "");
    setText("grant-policy", grant?.policy_id ?? "--");
    setText("grant-enabled", grant ? (grant.enabled ? "enabled" : "disabled") : "not registered");
    pretty("grant-json", grant);

    setBadge("decision-badge", decision ? "authorized" : "not found", decision ? "good" : "");
    setText("decision-amount", decision ? formatUnits(decision.amount) : "--");
    setText("receipt-id", decision?.decision_id ?? "--");
    setText("receipt-intent", decision?.intent_id ?? "--");
    setText("receipt-destination", decision?.destination ?? "--");
    setText("receipt-version", decision?.policy_version ?? "--");
    setText("receipt-cumulative", decision ? formatUnits(decision.cumulative_spend) : "--");
    setText("receipt-nonce", decision?.nonce ?? "--");
    pretty("decision-json", decision);

    setText("connection-state", "connected · finalized");
    setText("last-updated", highestBlock ? "block #" + highestBlock : "finalized state");
  } catch (error) {
    setText("connection-state", "rpc unavailable");
    errorPanel.hidden = false;
    setText("error-message", error instanceof Error ? error.message : "Unknown RPC error");
  } finally {
    button.disabled = false;
    button.textContent = "↻ refresh state";
  }
}

byId("refresh-button").addEventListener("click", refresh);
for (const id of ["contract-id", "policy-id", "agent-id", "decision-id"]) {
  byId(id).addEventListener("keydown", (event) => {
    if (event.key === "Enter") refresh();
  });
}
refresh();
