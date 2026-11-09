use near_sdk::{
    env, near, require, AccountId, PanicOnDefault,
    store::{LookupMap, LookupSet},
};

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Policy {
    pub enabled: bool,
    pub expires_at_ns: u64,
    pub max_per_transaction: u128,
    pub max_total: u128,
    pub allowed_destinations: Vec<AccountId>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct AgentGrant {
    pub policy_id: String,
    pub enabled: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct SpendDecision {
    pub decision_id: String,
    pub agent_id: AccountId,
    pub policy_id: String,
    pub destination: AccountId,
    pub amount: u128,
    pub nonce: u64,
    pub authorized_at_ns: u64,
    pub policy_expires_at_ns: u64,
    pub cumulative_spend: u128,
}

/// Outlay's first authorization primitive.
///
/// This contract records an authorization decision and budget reservation.
/// It does NOT transfer funds, sign transactions, or prove settlement.
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Outlay {
    owner: AccountId,
    policies: LookupMap<String, Policy>,
    grants: LookupMap<AccountId, AgentGrant>,
    spend_by_policy: LookupMap<String, u128>,
    consumed_nonces: LookupSet<String>,
    decision_count: u64,
}

#[near]
impl Outlay {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            owner,
            policies: LookupMap::new(b"p"),
            grants: LookupMap::new(b"g"),
            spend_by_policy: LookupMap::new(b"s"),
            consumed_nonces: LookupSet::new(b"n"),
            decision_count: 0,
        }
    }

    /// Owner creates or replaces a policy. Policy replacement is owner-only.
    pub fn set_policy(&mut self, policy_id: String, policy: Policy) {
        self.assert_owner();
        require!(!policy_id.is_empty(), "POLICY_ID_EMPTY");
        require!(policy.max_per_transaction > 0, "MAX_TX_ZERO");
        require!(policy.max_total >= policy.max_per_transaction, "INVALID_BUDGET");
        require!(!policy.allowed_destinations.is_empty(), "DESTINATIONS_EMPTY");
        self.policies.insert(policy_id, policy);
    }

    /// Owner binds an agent account to one policy.
    pub fn register_agent(&mut self, agent_id: AccountId, policy_id: String) {
        self.assert_owner();
        require!(self.policies.get(&policy_id).is_some(), "POLICY_NOT_FOUND");
        self.grants.insert(agent_id, AgentGrant { policy_id, enabled: true });
    }

    pub fn set_agent_enabled(&mut self, agent_id: AccountId, enabled: bool) {
        self.assert_owner();
        let mut grant = self.grants.get(&agent_id).cloned().expect("AGENT_NOT_FOUND");
        grant.enabled = enabled;
        self.grants.insert(agent_id, grant);
    }

    /// Atomically validates scope, expiry, nonce, and budget, then reserves spend.
    /// Caller must be the registered agent. This is authorization only, not payment.
    pub fn authorize_spend(
        &mut self,
        destination: AccountId,
        amount: u128,
        nonce: u64,
        intent_expires_at_ns: u64,
    ) -> SpendDecision {
        let agent_id = env::predecessor_account_id();
        let now = env::block_timestamp();
        require!(amount > 0, "AMOUNT_ZERO");

        let grant = self.grants.get(&agent_id).cloned().expect("AGENT_NOT_REGISTERED");
        require!(grant.enabled, "AGENT_DISABLED");

        let policy = self.policies.get(&grant.policy_id).cloned().expect("POLICY_NOT_FOUND");
        require!(policy.enabled, "POLICY_DISABLED");
        require!(now < policy.expires_at_ns, "POLICY_EXPIRED");
        require!(now < intent_expires_at_ns, "INTENT_EXPIRED");
        require!(intent_expires_at_ns <= policy.expires_at_ns, "INTENT_OUTLIVES_POLICY");
        require!(amount <= policy.max_per_transaction, "TX_LIMIT_EXCEEDED");
        require!(policy.allowed_destinations.iter().any(|d| d == &destination), "DESTINATION_DENIED");

        let nonce_key = format!("{}:{}", agent_id, nonce);
        require!(!self.consumed_nonces.contains(&nonce_key), "NONCE_REPLAY");

        let spent = self.spend_by_policy.get(&grant.policy_id).copied().unwrap_or(0);
        let next_spend = spent.checked_add(amount).expect("SPEND_OVERFLOW");
        require!(next_spend <= policy.max_total, "BUDGET_EXCEEDED");

        // State changes occur only after all validation checks pass.
        self.consumed_nonces.insert(nonce_key);
        self.spend_by_policy.insert(grant.policy_id.clone(), next_spend);
        self.decision_count = self.decision_count.checked_add(1).expect("DECISION_COUNT_OVERFLOW");

        let decision_id = format!("outlay:{}:{}", env::block_height(), self.decision_count);
        let decision = SpendDecision {
            decision_id: decision_id.clone(),
            agent_id: agent_id.clone(),
            policy_id: grant.policy_id,
            destination,
            amount,
            nonce,
            authorized_at_ns: now,
            policy_expires_at_ns: policy.expires_at_ns,
            cumulative_spend: next_spend,
        };

        env::log_str(&format!(
            "OUTLAY_DECISION:{{\"decision_id\":\"{}\",\"agent_id\":\"{}\",\"amount\":\"{}\",\"nonce\":{}}}",
            decision_id, agent_id, amount, nonce
        ));
        decision
    }

    pub fn get_policy(&self, policy_id: String) -> Option<Policy> {
        self.policies.get(&policy_id).cloned()
    }

    pub fn get_agent_grant(&self, agent_id: AccountId) -> Option<AgentGrant> {
        self.grants.get(&agent_id).cloned()
    }

    pub fn get_policy_spend(&self, policy_id: String) -> u128 {
        self.spend_by_policy.get(&policy_id).copied().unwrap_or(0)
    }

    pub fn get_decision_count(&self) -> u64 {
        self.decision_count
    }

    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "OWNER_ONLY");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{test_utils::VMContextBuilder, testing_env};

    fn account(name: &str) -> AccountId {
        name.parse().unwrap()
    }

    fn context(predecessor: AccountId, timestamp: u64) {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(predecessor);
        builder.block_timestamp(timestamp);
        testing_env!(builder.build());
    }

    fn setup() -> Outlay {
        context(account("owner.testnet"), 10);
        let mut contract = Outlay::new(account("owner.testnet"));
        contract.set_policy("daily".into(), Policy {
            enabled: true,
            expires_at_ns: 1_000,
            max_per_transaction: 60,
            max_total: 100,
            allowed_destinations: vec![account("merchant.testnet")],
        });
        contract.register_agent(account("agent.testnet"), "daily".into());
        contract
    }

    #[test]
    fn authorized_spend_reserves_budget_and_consumes_nonce() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        let decision = contract.authorize_spend(account("merchant.testnet"), 40, 1, 500);
        assert_eq!(decision.amount, 40);
        assert_eq!(contract.get_policy_spend("daily".into()), 40);
        assert_eq!(contract.get_decision_count(), 1);
    }

    #[test]
    #[should_panic(expected = "DESTINATION_DENIED")]
    fn destination_outside_policy_is_denied() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        contract.authorize_spend(account("attacker.testnet"), 10, 1, 500);
    }

    #[test]
    #[should_panic(expected = "TX_LIMIT_EXCEEDED")]
    fn transaction_limit_is_enforced() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        contract.authorize_spend(account("merchant.testnet"), 61, 1, 500);
    }

    #[test]
    #[should_panic(expected = "BUDGET_EXCEEDED")]
    fn total_budget_is_enforced() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        contract.authorize_spend(account("merchant.testnet"), 60, 1, 500);
        contract.authorize_spend(account("merchant.testnet"), 41, 2, 500);
    }

    #[test]
    #[should_panic(expected = "NONCE_REPLAY")]
    fn nonce_replay_is_denied() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        contract.authorize_spend(account("merchant.testnet"), 10, 7, 500);
        contract.authorize_spend(account("merchant.testnet"), 10, 7, 500);
    }

    #[test]
    #[should_panic(expected = "INTENT_EXPIRED")]
    fn expired_intent_is_denied() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        contract.authorize_spend(account("merchant.testnet"), 10, 1, 20);
    }

    #[test]
    #[should_panic(expected = "AGENT_DISABLED")]
    fn disabled_agent_is_denied() {
        let mut contract = setup();
        context(account("owner.testnet"), 20);
        contract.set_agent_enabled(account("agent.testnet"), false);
        context(account("agent.testnet"), 30);
        contract.authorize_spend(account("merchant.testnet"), 10, 1, 500);
    }
}
