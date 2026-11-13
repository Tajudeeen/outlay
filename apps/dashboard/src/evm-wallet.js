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
  const status = $("#evm-wallet-status");
  if (status) {
    status.textContent = message;
    status.dataset.tone = tone;
  }
  const button = $("#evm-wallet-connect");
  if (button) {
    button.textContent = activeAccount ? "disconnect evm" : "connect evm";
    button.dataset.connected = activeAccount ? "true" : "false";
  }
}

function publishState() {
  window.dispatchEvent(new CustomEvent("outlay:evm-wallet-state", {
    detail: {
      account: activeAccount,
      wallet: activeWalletName,
      chainId: activeProvider?.chainId || null,
      connected: Boolean(activeAccount),
      canManageNear: false,
    },
  }));
}

function addProvider(provider, info = {}) {
  if (!provider || typeof provider.request !== "function") return;
  const existing = [...providers.entries()].find(([, entry]) => entry.provider === provider);
  if (existing) return;
  const key = info.uuid || info.rdns || info.name || "injected-" + providers.size;
  const entry = { provider, info, name: walletLabel(provider, info) };
  providers.set(key, entry);
  provider.on?.("accountsChanged", (accounts) => {
    if (provider !== activeProvider) return;
    activeAccount = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : null;
    if (!activeAccount) {
      disconnectProvider();
      return;
    }
    setStatus(entry.name + " · " + activeAccount.slice(0, 6) + "…" + activeAccount.slice(-4), "success");
    publishState();
  });
  provider.on?.("chainChanged", (chainId) => {
    if (provider !== activeProvider) return;
    publishState();
    setStatus(entry.name + " · chain " + chainId, "success");
  });
  provider.on?.("disconnect", () => {
    if (provider === activeProvider) disconnectProvider();
  });
}

function discoverInjectedProviders() {
  const injected = window.ethereum;
  if (!injected) return;
  if (Array.isArray(injected.providers)) {
    injected.providers.forEach((provider) => addProvider(provider));
  } else {
    addProvider(injected);
  }
}

function renderWalletOptions() {
  const menu = $("#evm-wallet-options");
  if (!menu) return;
  menu.replaceChildren();
  for (const [key, entry] of providers) {
    const option = document.createElement("button");
    option.type = "button";
    option.textContent = entry.name;
    if (entry.info.icon) {
      const image = document.createElement("img");
      image.src = entry.info.icon;
      image.alt = "";
      image.referrerPolicy = "no-referrer";
      option.prepend(image);
    }
    option.addEventListener("click", () => {
      menu.hidden = true;
      connectProvider(key);
    });
    menu.append(option);
  }
  menu.hidden = providers.size === 0;
}

async function connectProvider(key) {
  const entry = providers.get(key);
  if (!entry) return;
  setStatus("waiting for wallet approval…", "pending");
  try {
    const accounts = await entry.provider.request({ method: "eth_requestAccounts" });
    if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
      throw new Error("Wallet returned no account");
    }
    activeProvider = entry.provider;
    activeAccount = accounts[0];
    activeWalletName = entry.name;
    setStatus(entry.name + " · " + activeAccount.slice(0, 6) + "…" + activeAccount.slice(-4), "success");
    publishState();
  } catch (error) {
    setStatus(error?.code === 4001 ? "connection rejected" : "wallet connection failed", "warning");
  }
}

async function disconnectProvider() {
  activeProvider = null;
  activeAccount = null;
  activeWalletName = null;
  setStatus("evm wallet not connected", "muted");
  publishState();
}

export function initializeEvmWallet() {
  if (initialized) return;
  initialized = true;
  const button = $("#evm-wallet-connect");
  if (!button) return;

  window.addEventListener("eip6963:announceProvider", (event) => {
    addProvider(event.detail?.provider, event.detail?.info || {});
    renderWalletOptions();
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  discoverInjectedProviders();
  renderWalletOptions();

  button.addEventListener("click", () => {
    if (activeAccount) {
      disconnectProvider();
      return;
    }
    if (providers.size === 0) {
      setStatus("no injected evm wallet found", "warning");
      return;
    }
    if (providers.size === 1) {
      connectProvider(providers.keys().next().value);
      return;
    }
    const menu = $("#evm-wallet-options");
    if (menu) menu.hidden = !menu.hidden;
  });

  document.addEventListener("click", (event) => {
    const menu = $("#evm-wallet-options");
    if (menu && !menu.contains(event.target) && event.target !== button) menu.hidden = true;
  });



  setStatus("evm wallet not connected", "muted");
}
