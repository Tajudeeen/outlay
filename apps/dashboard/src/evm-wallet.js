const $ = (selector) => document.querySelector(selector);
const providers = new Map();
let activeProvider = null;
let activeAccount = null;
let activeWalletName = null;
let initialized = false;

function walletLabel(provider, info = {}) {
  if (info.name) return info.name;
  if (provider?.isRabby) return "Rabby";
  if (provider?.isMetaMask) return "MetaMask";
  if (provider?.isOKXWallet || provider?.isOkxWallet) return "OKX Wallet";
  return "Injected EVM wallet";
}
function setStatus(message, tone = "muted") {
  const status = $("#wallet-status");
  if (status) { status.textContent = message; status.dataset.tone = tone; }
}
function publishState() {
  window.dispatchEvent(new CustomEvent("outlay:evm-wallet-state", {
    detail: { account: activeAccount, wallet: activeWalletName, chainId: activeProvider?.chainId || null, connected: Boolean(activeAccount), canManageNear: false },
  }));
}
function addProvider(provider, info = {}) {
  if (!provider || typeof provider.request !== "function") return;
  if ([...providers.values()].some((entry) => entry.provider === provider)) return;
  const key = info.uuid || info.rdns || info.name || "injected-" + providers.size;
  const entry = { provider, info, name: walletLabel(provider, info) };
  providers.set(key, entry);
  provider.on?.("accountsChanged", (accounts) => {
    if (provider !== activeProvider) return;
    activeAccount = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : null;
    if (!activeAccount) { disconnectProvider(); return; }
    setStatus(entry.name + " · " + activeAccount.slice(0, 6) + "…" + activeAccount.slice(-4), "success");
    publishState();
  });
  provider.on?.("chainChanged", (chainId) => {
    if (provider !== activeProvider) return;
    setStatus(entry.name + " · chain " + chainId, "success");
    publishState();
  });
  provider.on?.("disconnect", () => { if (provider === activeProvider) disconnectProvider(); });
  renderWalletOptions();
}
function discoverInjectedProviders() {
  const injected = window.ethereum;
  if (!injected) return;
  if (Array.isArray(injected.providers)) injected.providers.forEach((provider) => addProvider(provider));
  else addProvider(injected);
}
function renderWalletOptions() {
  const list = $("#evm-wallet-options");
  if (!list) return;
  list.replaceChildren();
  if (!providers.size) {
    const empty = document.createElement("p");
    empty.className = "wallet-picker-empty";
    empty.textContent = "no injected evm wallets detected in this browser";
    list.append(empty);
    return;
  }
  for (const [key, entry] of providers) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "wallet-choice";
    const mark = document.createElement("span");
    mark.className = "wallet-choice-mark";
    mark.textContent = entry.name.toLowerCase().includes("rabby") ? "R" : entry.name.toLowerCase().includes("okx") ? "O" : entry.name.toLowerCase().includes("meta") ? "M" : "E";
    const details = document.createElement("span");
    const name = document.createElement("b");
    name.textContent = entry.name;
    const description = document.createElement("small");
    description.textContent = "connect evm account";
    details.append(name, description);
    const arrow = document.createElement("span");
    arrow.textContent = "↗";
    option.append(mark, details, arrow);
    option.addEventListener("click", () => connectProvider(key));
    list.append(option);
  }
}
async function connectProvider(key) {
  const entry = providers.get(key);
  if (!entry) return;
  setStatus("waiting for " + entry.name + " approval…", "pending");
  try {
    const accounts = await entry.provider.request({ method: "eth_requestAccounts" });
    if (!Array.isArray(accounts) || typeof accounts[0] !== "string") throw new Error("wallet returned no account");
    activeProvider = entry.provider;
    activeAccount = accounts[0];
    activeWalletName = entry.name;
    $("#wallet-picker").hidden = true;
    $("#wallet-connect").setAttribute("aria-expanded", "false");
    setStatus(entry.name + " · " + activeAccount.slice(0, 6) + "…" + activeAccount.slice(-4), "success");
    publishState();
  } catch (error) {
    setStatus(error?.code === 4001 ? "connection rejected" : "evm wallet connection failed", "warning");
  }
}
function disconnectProvider() {
  activeProvider = null;
  activeAccount = null;
  activeWalletName = null;
  setStatus("wallet disconnected", "muted");
  publishState();
}
export function initializeEvmWallet() {
  if (initialized) return;
  initialized = true;
  window.addEventListener("eip6963:announceProvider", (event) => addProvider(event.detail?.provider, event.detail?.info || {}));
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  discoverInjectedProviders();
  renderWalletOptions();
}
