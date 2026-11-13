import { NearConnector } from "https://esm.sh/@hot-labs/near-connect@0.12.0?bundle";
import { callView } from "./near-rpc.js";
import { createAdminClient } from "./admin-transactions.js";

const CONTRACT_ID = "outlay-deployer.testnet";
const NETWORK_ID = "testnet";
const $ = (selector) => document.querySelector(selector);

let connector;
let wallet;
let accountId = null;
let ownerId = null;
let adminClient = null;
let initialized = false;
let busy = false;

function setStatus(message, tone = "muted") {
  const status = $("#wallet-status");
  if (status) {
    status.textContent = message;
    status.dataset.tone = tone;
  }
  const button = $("#wallet-connect");
  if (button) {
    button.textContent = accountId ? "wallet connected" : busy ? "connecting…" : "connect wallet";
    button.disabled = busy;
    button.dataset.connected = accountId ? "true" : "false";
  }
}

function publishState() {
  window.dispatchEvent(new CustomEvent("outlay:wallet-state", {
    detail: { accountId, ownerId, isOwner: Boolean(adminClient), adminClient },
  }));
}

async function clearWallet(message = "wallet disconnected") {
  wallet = null;
  accountId = null;
  ownerId = null;
  adminClient = null;
  setStatus(message, "muted");
  publishState();
}

async function verifyConnectedOwner(nextAccountId) {
  setStatus("checking contract owner…", "pending");
  adminClient = null;
  ownerId = null;
  accountId = nextAccountId;
  try {
    const response = await callView(CONTRACT_ID, "get_owner");
    if (typeof response.value !== "string" || !response.value) {
      throw new Error("INVALID_CONTRACT_OWNER");
    }
    ownerId = response.value;
    if (accountId !== ownerId) {
      setStatus("connected, not contract owner", "warning");
      publishState();
      return;
    }
    if (!wallet || typeof wallet.signAndSendTransaction !== "function") {
      throw new Error("WALLET_SIGNING_UNAVAILABLE");
    }
    adminClient = createAdminClient({
      wallet, accountId, ownerId, networkId: NETWORK_ID, contractId: CONTRACT_ID,
    });
    setStatus("contract owner verified", "success");
    publishState();
  } catch (error) {
    adminClient = null;
    const message = error?.message || "";
    setStatus(message.includes("get_owner")
      ? "owner check unavailable, contract upgrade required"
      : "owner check failed, management locked", "warning");
    publishState();
  }
}

async function handleSignIn(event) {
  const selected = event?.accounts?.[0]?.accountId;
  if (typeof selected !== "string" || !selected) {
    await clearWallet("wallet returned no account");
    return;
  }
  try {
    wallet = await connector.wallet();
    await verifyConnectedOwner(selected);
  } catch {
    await clearWallet("wallet connection could not be verified");
  }
}

export async function initializeWallet() {
  if (initialized) return;
  initialized = true;
  const button = $("#wallet-connect");
  if (!button) return;
  try {
    connector = new NearConnector({
      network: NETWORK_ID,
      features: { testnet: true },
      footerBranding: null,
    });
    connector.on("wallet:signIn", handleSignIn);
    connector.on("wallet:signOut", () => clearWallet());
    button.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      setStatus("opening wallet…", "pending");
      try {
        if (accountId && wallet) {
          if (typeof wallet.signOut === "function") await wallet.signOut();
          else if (typeof connector.disconnect === "function") await connector.disconnect();
          await clearWallet();
        } else {
          await connector.connect();
        }
      } catch (error) {
        setStatus(error?.message || "wallet connection failed", "warning");
      } finally {
        busy = false;
        if (!accountId) setStatus("wallet not connected", "muted");
        else setStatus(adminClient ? "contract owner verified" : "connected, management locked", adminClient ? "success" : "warning");
        button.disabled = false;
      }
    });
    setStatus("wallet not connected", "muted");
  } catch {
    setStatus("wallet connector unavailable", "warning");
    button.disabled = true;
  }
}

export function getVerifiedAdminClient() {
  return adminClient;
}
