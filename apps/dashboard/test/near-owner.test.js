import test from "node:test";
import assert from "node:assert/strict";
import { loadContractOwner } from "../src/near-rpc.js";

function response(value, blockHeight = 100, blockHash = "final-hash") {
  const bytes = [...new TextEncoder().encode(JSON.stringify(value))];
  return {
    ok: true,
    async json() {
      return { result: { result: bytes, block_height: blockHeight, block_hash: blockHash } };
    },
  };
}

test("reads the contract owner from finalized testnet state", async () => {
  const owner = await loadContractOwner("outlay-deployer.testnet", async () => response("owner.testnet"));
  assert.equal(owner.accountId, "owner.testnet");
  assert.equal(owner.blockHeight, 100);
  assert.equal(owner.blockHash, "final-hash");
});

test("rejects an invalid owner response", async () => {
  await assert.rejects(
    () => loadContractOwner("outlay-deployer.testnet", async () => response(null)),
    /INVALID_CONTRACT_OWNER/,
  );
});
