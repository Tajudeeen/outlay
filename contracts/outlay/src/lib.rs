const MAX_POLICY_ID_BYTES: usize = 128;
const MAX_ALLOWED_DESTINATIONS: usize = 32;

use near_sdk::{
    env, near, require,
    store::{LookupMap, LookupSet},
    AccountId, PanicOnDefault,
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
    pub intent_id: String,
    pub policy_version: u64,
    pub agent_id: AccountId,
    pub policy_id: String,
    pub destination: AccountId,
    pub amount: u128,
    pub nonce: u64,
    pub authorized_at_ns: u64,
    pub policy_expires_at_ns: u64,
    pub intent_expires_at_ns: u64,
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
    policy_versions: LookupMap<String, u64>,
    grants: LookupMap<AccountId, AgentGrant>,
    spend_by_policy: LookupMap<String, u128>,
    consumed_nonces: LookupSet<String>,
    consumed_intents: LookupSet<String>,
    decisions: LookupMap<String, SpendDecision>,
    released_reservations: LookupSet<String>,
    decision_count: u64,
}

#[near]
impl Outlay {
    #[init]
    pub fn new() -> Self {
        Self {
            owner: env::predecessor_account_id(),
            policies: LookupMap::new(b"p"),
            policy_versions: LookupMap::new(b"v"),
            grants: LookupMap::new(b"g"),
            spend_by_policy: LookupMap::new(b"s"),
            consumed_nonces: LookupSet::new(b"n"),
            consumed_intents: LookupSet::new(b"i"),
            decisions: LookupMap::new(b"d"),
            released_reservations: LookupSet::new(b"r"),
            decision_count: 0,
        }
    }

    /// Owner creates or replaces a policy. Policy replacement is owner-only.
    pub fn set_policy(&mut self, policy_id: String, policy: Policy) {
        self.assert_owner();
        require!(!policy_id.is_empty(), "POLICY_ID_EMPTY");
        require!(
            policy_id.len() <= MAX_POLICY_ID_BYTES
                && policy_id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.'),
            "POLICY_ID_INVALID"
        );
        require!(
            policy.allowed_destinations.len() <= MAX_ALLOWED_DESTINATIONS,
            "TOO_MANY_DESTINATIONS"
        );
        require!(policy.max_per_transaction > 0, "MAX_TX_ZERO");
        require!(policy.max_total >= policy.max_per_transaction, "INVALID_BUDGET");
        let currently_reserved = self.spend_by_policy.get(&policy_id).copied().unwrap_or(0);
        require!(policy.max_total >= currently_reserved, "BUDGET_BELOW_RESERVED");
        require!(!policy.allowed_destinations.is_empty(), "DESTINATIONS_EMPTY");
        let next_version = self
            .policy_versions
            .get(&policy_id)
            .copied()
            .unwrap_or(0)
            .checked_add(1)
            .expect("POLICY_VERSION_OVERFLOW");
        self.policy_versions.insert(policy_id.clone(), next_version);
        self.policies.insert(policy_id, policy);
    }

    /// Owner binds an agent account to one policy.
    pub fn register_agent(&mut self, agent_id: AccountId, policy_id: String) {
        self.assert_owner();
        require!(self.policies.get(&policy_id).is_some(), "POLICY_NOT_FOUND");
        self.grants.insert(
            agent_id,
            AgentGrant {
                policy_id,
                enabled: true,
            },
        );
    }

    pub fn set_agent_enabled(&mut self, agent_id: AccountId, enabled: bool) {
        self.assert_owner();
        let mut grant = self
            .grants
            .get(&agent_id)
            .cloned()
            .expect("AGENT_NOT_FOUND");
        grant.enabled = enabled;
        self.grants.insert(agent_id, grant);
    }

    /// Atomically validates scope, expiry, nonce, and budget, then reserves spend.
    /// Caller must be the registered agent. This is authorization only, not payment.
    pub fn authorize_spend(
        &mut self,
        intent_id: String,
        destination: AccountId,
        amount: u128,
        nonce: u64,
        intent_expires_at_ns: u64,
    ) -> SpendDecision {
        let agent_id = env::predecessor_account_id();
        let now = env::block_timestamp();
        require!(amount > 0, "AMOUNT_ZERO");
        require!(!intent_id.is_empty() && intent_id.len() <= 128, "INTENT_ID_INVALID");
        require!(
            intent_id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.'),
            "INTENT_ID_INVALID"
        );

        let grant = self
            .grants
            .get(&agent_id)
            .cloned()
            .expect("AGENT_NOT_REGISTERED");
        require!(grant.enabled, "AGENT_DISABLED");

        let policy = self
            .policies
            .get(&grant.policy_id)
            .cloned()
            .expect("POLICY_NOT_FOUND");
        require!(policy.enabled, "POLICY_DISABLED");
        require!(now < policy.expires_at_ns, "POLICY_EXPIRED");
        require!(now < intent_expires_at_ns, "INTENT_EXPIRED");
        require!(intent_expires_at_ns <= policy.expires_at_ns, "INTENT_OUTLIVES_POLICY");
        require!(amount <= policy.max_per_transaction, "TX_LIMIT_EXCEEDED");
        require!(policy.allowed_destinations.iter().any(|d| d == &destination), "DESTINATION_DENIED");

        let policy_version = self
            .policy_versions
            .get(&grant.policy_id)
            .copied()
            .expect("POLICY_VERSION_NOT_FOUND");

        let nonce_key = format!("{}:{}", agent_id, nonce);
        require!(!self.consumed_nonces.contains(&nonce_key), "NONCE_REPLAY");
        let intent_key = format!("{}:{}", agent_id, intent_id);
        require!(!self.consumed_intents.contains(&intent_key), "INTENT_REPLAY");

        let spent = self
            .spend_by_policy
            .get(&grant.policy_id)
            .copied()
            .unwrap_or(0);
        let next_spend = spent.checked_add(amount).expect("SPEND_OVERFLOW");
        require!(next_spend <= policy.max_total, "BUDGET_EXCEEDED");

        // State changes occur only after all validation checks pass.
        self.consumed_nonces.insert(nonce_key);
        self.consumed_intents.insert(intent_key);
        self
            .spend_by_policy
            .insert(grant.policy_id.clone(), next_spend);
        self.decision_count = self
            .decision_count
            .checked_add(1)
            .expect("DECISION_COUNT_OVERFLOW");

        let decision_id = format!("outlay:{}:{}", env::block_height(), self.decision_count);
        let decision = SpendDecision {
            decision_id: decision_id.clone(),
            intent_id: intent_id.clone(),
            policy_version,
            agent_id: agent_id.clone(),
            policy_id: grant.policy_id,
            destination,
            amount,
            nonce,
            authorized_at_ns: now,
            policy_expires_at_ns: policy.expires_at_ns,
            intent_expires_at_ns,
            cumulative_spend: next_spend,
        };

        self.decisions.insert(decision_id.clone(), decision.clone());

        // NEP-297-style event: this records authorization only, not execution.
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"outlay\",\"version\":\"1.0.0\",\"event\":\"spend_authorized\",\"data\":[{{\"decision_id\":\"{}\",\"agent_id\":\"{}\",\"policy_id\":\"{}\",\"intent_id\":\"{}\",\"policy_version\":\"{}\",\"destination\":\"{}\",\"amount\":\"{}\",\"nonce\":\"{}\",\"authorized_at_ns\":\"{}\",\"cumulative_spend\":\"{}\"}}]}}",
            decision_id, agent_id, decision.policy_id, intent_id, policy_version, decision.destination, amount, nonce, now, next_spend
        ));
        decision
    }

    /// Releases an authorization reservation only after its intent expiry.
    /// This is owner-triggered reconciliation, not proof that execution failed.
    pub fn release_expired_reservation(&mut self, decision_id: String) {
        self.assert_owner();
        let now = env::block_timestamp();
        let decision = self
            .decisions
            .get(&decision_id)
            .cloned()
            .expect("DECISION_NOT_FOUND");
        require!(now >= decision.intent_expires_at_ns, "RESERVATION_NOT_EXPIRED");
        require!(
            !self.released_reservations.contains(&decision_id),
            "RESERVATION_ALREADY_RELEASED"
        );

        let reserved = self
            .spend_by_policy
            .get(&decision.policy_id)
            .copied()
            .unwrap_or(0);
        let remaining = reserved
            .checked_sub(decision.amount)
            .expect("RESERVATION_ACCOUNTING_ERROR");
        self.spend_by_policy
            .insert(decision.policy_id.clone(), remaining);
        self.released_reservations.insert(decision_id.clone());

        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"outlay\",\"version\":\"1.0.0\",\"event\":\"reservation_released\",\"data\":[{{\"decision_id\":\"{}\",\"amount\":\"{}\",\"released_at_ns\":\"{}\"}}]}}",
            decision_id, decision.amount, now
        ));
    }

    pub fn get_decision(&self, decision_id: String) -> Option<SpendDecision> {
        self.decisions.get(&decision_id).cloned()
    }

    pub fn is_reservation_released(&self, decision_id: String) -> bool {
        self.released_reservations.contains(&decision_id)
    }

    pub fn get_policy_version(&self, policy_id: String) -> u64 {
        self.policy_versions.get(&policy_id).copied().unwrap_or(0)
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
        let mut contract = Outlay::new();
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
    fn policy_updates_increment_version_without_resetting_reservations() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        let first = contract.authorize_spend("intent-1".into(), account("merchant.testnet"), 30, 1, 500);
        assert_eq!(first.policy_version, 1);
        assert_eq!(contract.get_policy_spend("daily".into()), 30);

        context(account("owner.testnet"), 25);
        contract.set_policy("daily".into(), Policy {
            enabled: true,
            expires_at_ns: 1_000,
            max_per_transaction: 50,
            max_total: 100,
            allowed_destinations: vec![account("merchant.testnet")],
        });
        assert_eq!(contract.get_policy_version("daily".into()), 2);
        assert_eq!(contract.get_policy_spend("daily".into()), 30);

        context(account("agent.testnet"), 30);
        let second = contract.authorize_spend("intent-2".into(), account("merchant.testnet"), 20, 2, 500);
        assert_eq!(second.policy_version, 2);
        assert_eq!(contract.get_policy_spend("daily".into()), 50);
    }

    #[test]
    fn authorized_spend_reserves_budget_and_consumes_nonce() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        let decision = contract.authorize_spend("intent-1".into(), account("merchant.testnet"), 40, 1, 500);
        assert_eq!(decision.amount, 40);
        assert_eq!(contract.get_policy_spend("daily".into()), 40);
        assert_eq!(contract.get_decision_count(), 1);
    }

    #[test]
    #[should_panic(expected = "DESTINATION_DENIED")]
    fn destination_outside_policy_is_denied() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        contract.authorize_spend("intent-1".into(), account("attacker.testnet"), 10, 1, 500);
    }

    #[test]
    #[should_panic(expected = "TX_LIMIT_EXCEEDED")]
    fn transaction_limit_is_enforced() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        contract.authorize_spend("intent-1".into(), account("merchant.testnet"), 61, 1, 500);
    }

    #[test]
    #[should_panic(expected = "BUDGET_EXCEEDED")]
    fn total_budget_is_enforced() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        contract.authorize_spend("intent-1".into(), account("merchant.testnet"), 60, 1, 500);
        contract.authorize_spend("intent-2".into(), account("merchant.testnet"), 41, 2, 500);
    }

    #[test]
    #[should_panic(expected = "NONCE_REPLAY")]
    fn nonce_replay_is_denied() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        contract.authorize_spend("intent-1".into(), account("merchant.testnet"), 10, 7, 500);
        contract.authorize_spend("intent-1".into(), account("merchant.testnet"), 10, 7, 500);
    }

    #[test]
    #[should_panic(expected = "INTENT_ID_INVALID")]
    fn intent_id_rejects_event_injection_characters() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        contract.authorize_spend("bad/id".into(), account("merchant.testnet"), 10, 1, 500);
    }

    #[test]
    #[should_panic(expected = "INTENT_REPLAY")]
    fn intent_replay_is_denied_even_with_new_nonce() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        contract.authorize_spend("same-intent".into(), account("merchant.testnet"), 10, 7, 500);
        contract.authorize_spend("same-intent".into(), account("merchant.testnet"), 10, 8, 500);
    }

    #[test]
    #[should_panic(expected = "INTENT_EXPIRED")]
    fn expired_intent_is_denied() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        contract.authorize_spend("intent-1".into(), account("merchant.testnet"), 10, 1, 20);
    }

    #[test]
    #[should_panic(expected = "AGENT_DISABLED")]
    fn disabled_agent_is_denied() {
        let mut contract = setup();
        context(account("owner.testnet"), 20);
        contract.set_agent_enabled(account("agent.testnet"), false);
        context(account("agent.testnet"), 30);
        contract.authorize_spend("intent-1".into(), account("merchant.testnet"), 10, 1, 500);
    }

    #[test]
    #[should_panic(expected = "OWNER_ONLY")]
    fn non_owner_cannot_change_policy() {
        let mut contract = setup();
        context(account("attacker.testnet"), 30);
        contract.set_policy("daily".into(), Policy {
            enabled: true,
            expires_at_ns: 1_000,
            max_per_transaction: 60,
            max_total: 100,
            allowed_destinations: vec![account("merchant.testnet")],
        });
    }

    #[test]
    #[should_panic(expected = "POLICY_ID_INVALID")]
    fn policy_id_rejects_unsafe_event_characters() {
        let mut contract = setup();
        context(account("owner.testnet"), 30);
        contract.set_policy("bad/id".into(), Policy {
            enabled: true,
            expires_at_ns: 1_000,
            max_per_transaction: 60,
            max_total: 100,
            allowed_destinations: vec![account("merchant.testnet")],
        });
    }

    #[test]
    fn expired_reservation_can_be_released_once_by_owner() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        let decision = contract.authorize_spend("intent-1".into(), account("merchant.testnet"), 40, 9, 500);
        assert_eq!(contract.get_policy_spend("daily".into()), 40);

        context(account("owner.testnet"), 500);
        contract.release_expired_reservation(decision.decision_id.clone());
        assert_eq!(contract.get_policy_spend("daily".into()), 0);
        assert!(contract.is_reservation_released(decision.decision_id));
    }

    #[test]
    #[should_panic(expected = "INTENT_REPLAY")]
    fn releasing_reservation_does_not_restore_intent_id() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        let decision = contract.authorize_spend("intent-1".into(), account("merchant.testnet"), 40, 9, 500);
        context(account("owner.testnet"), 500);
        contract.release_expired_reservation(decision.decision_id);
        context(account("agent.testnet"), 501);
        contract.authorize_spend("intent-1".into(), account("merchant.testnet"), 40, 10, 900);
    }

    #[test]
    #[should_panic(expected = "RESERVATION_NOT_EXPIRED")]
    fn reservation_cannot_be_released_before_expiry() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        let decision = contract.authorize_spend("intent-1".into(), account("merchant.testnet"), 40, 9, 500);
        context(account("owner.testnet"), 499);
        contract.release_expired_reservation(decision.decision_id);
    }

    #[test]
    #[should_panic(expected = "RESERVATION_ALREADY_RELEASED")]
    fn reservation_cannot_be_released_twice() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        let decision = contract.authorize_spend("intent-1".into(), account("merchant.testnet"), 40, 9, 500);
        context(account("owner.testnet"), 500);
        contract.release_expired_reservation(decision.decision_id.clone());
        contract.release_expired_reservation(decision.decision_id);
    }

    #[test]
    #[should_panic(expected = "AMOUNT_ZERO")]
    fn zero_amount_is_denied() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        contract.authorize_spend("zero-amount".into(), account("merchant.testnet"), 0, 1, 500);
    }

    #[test]
    #[should_panic(expected = "POLICY_DISABLED")]
    fn disabled_policy_is_denied() {
        let mut contract = setup();
        context(account("owner.testnet"), 20);
        let mut policy = contract.get_policy("daily".into()).unwrap();
        policy.enabled = false;
        contract.set_policy("daily".into(), policy);
        context(account("agent.testnet"), 30);
        contract.authorize_spend("disabled-policy".into(), account("merchant.testnet"), 10, 1, 500);
    }

    #[test]
    #[should_panic(expected = "POLICY_EXPIRED")]
    fn expired_policy_is_denied() {
        let mut contract = setup();
        context(account("owner.testnet"), 20);
        let mut policy = contract.get_policy("daily".into()).unwrap();
        policy.expires_at_ns = 20;
        contract.set_policy("daily".into(), policy);
        context(account("agent.testnet"), 21);
        contract.authorize_spend("expired-policy".into(), account("merchant.testnet"), 10, 1, 500);
    }

    #[test]
    #[should_panic(expected = "INTENT_OUTLIVES_POLICY")]
    fn intent_cannot_outlive_policy() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        contract.authorize_spend("long-intent".into(), account("merchant.testnet"), 10, 1, 1_001);
    }

    #[test]
    #[should_panic(expected = "AGENT_NOT_REGISTERED")]
    fn unregistered_agent_is_denied() {
        let mut contract = setup();
        context(account("stranger.testnet"), 20);
        contract.authorize_spend("unknown-agent".into(), account("merchant.testnet"), 10, 1, 500);
    }

    #[test]
    #[should_panic(expected = "BUDGET_BELOW_RESERVED")]
    fn policy_budget_cannot_be_reduced_below_existing_reservations() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        contract.authorize_spend("reserved-before-update".into(), account("merchant.testnet"), 40, 1, 500);

        context(account("owner.testnet"), 30);
        contract.set_policy("daily".into(), Policy {
            enabled: true,
            expires_at_ns: 1_000,
            max_per_transaction: 30,
            max_total: 30,
            allowed_destinations: vec![account("merchant.testnet")],
        });
    }

    #[test]
    fn rejected_authorization_does_not_change_budget_or_decision_count() {
        use std::panic::{catch_unwind, AssertUnwindSafe};

        let mut contract = setup();
        context(account("agent.testnet"), 20);
        let result = catch_unwind(AssertUnwindSafe(|| {
            contract.authorize_spend(
                "over-limit-no-mutation".into(),
                account("merchant.testnet"),
                61,
                1,
                500,
            );
        }));

        assert!(result.is_err());
        assert_eq!(contract.get_policy_spend("daily".into()), 0);
        assert_eq!(contract.get_decision_count(), 0);
    }


    #[test]
    #[should_panic(expected = "POLICY_ID_INVALID")]
    fn policy_id_length_is_bounded() {
        let mut contract = setup();
        context(account("owner.testnet"), 30);
        contract.set_policy("p".repeat(MAX_POLICY_ID_BYTES + 1), Policy {
            enabled: true,
            expires_at_ns: 1_000,
            max_per_transaction: 60,
            max_total: 100,
            allowed_destinations: vec![account("merchant.testnet")],
        });
    }

    #[test]
    #[should_panic(expected = "TOO_MANY_DESTINATIONS")]
    fn destination_allowlist_length_is_bounded() {
        let mut contract = setup();
        context(account("owner.testnet"), 30);
        contract.set_policy("large-list".into(), Policy {
            enabled: true,
            expires_at_ns: 1_000,
            max_per_transaction: 60,
            max_total: 100,
            allowed_destinations: vec![account("merchant.testnet"); MAX_ALLOWED_DESTINATIONS + 1],
        });
    }

    #[test]
    #[should_panic(expected = "DESTINATIONS_EMPTY")]
    fn empty_destination_allowlist_is_denied() {
        let mut contract = setup();
        context(account("owner.testnet"), 30);
        contract.set_policy("empty-list".into(), Policy {
            enabled: true,
            expires_at_ns: 1_000,
            max_per_transaction: 60,
            max_total: 100,
            allowed_destinations: vec![],
        });
    }

    #[test]
    #[should_panic(expected = "MAX_TX_ZERO")]
    fn zero_per_transaction_limit_is_denied() {
        let mut contract = setup();
        context(account("owner.testnet"), 30);
        contract.set_policy("zero-limit".into(), Policy {
            enabled: true,
            expires_at_ns: 1_000,
            max_per_transaction: 0,
            max_total: 100,
            allowed_destinations: vec![account("merchant.testnet")],
        });
    }

    #[test]
    #[should_panic(expected = "INVALID_BUDGET")]
    fn total_budget_below_per_transaction_limit_is_denied() {
        let mut contract = setup();
        context(account("owner.testnet"), 30);
        contract.set_policy("bad-budget".into(), Policy {
            enabled: true,
            expires_at_ns: 1_000,
            max_per_transaction: 60,
            max_total: 59,
            allowed_destinations: vec![account("merchant.testnet")],
        });
    }

    #[test]
    #[should_panic(expected = "POLICY_NOT_FOUND")]
    fn agent_cannot_be_bound_to_unknown_policy() {
        let mut contract = setup();
        context(account("owner.testnet"), 30);
        contract.register_agent(account("new-agent.testnet"), "missing".into());
    }

    #[test]
    #[should_panic(expected = "OWNER_ONLY")]
    fn non_owner_cannot_register_agent() {
        let mut contract = setup();
        context(account("attacker.testnet"), 30);
        contract.register_agent(account("new-agent.testnet"), "daily".into());
    }

    #[test]
    #[should_panic(expected = "OWNER_ONLY")]
    fn non_owner_cannot_change_agent_status() {
        let mut contract = setup();
        context(account("attacker.testnet"), 30);
        contract.set_agent_enabled(account("agent.testnet"), false);
    }

    #[test]
    #[should_panic(expected = "OWNER_ONLY")]
    fn non_owner_cannot_release_reservation() {
        let mut contract = setup();
        context(account("agent.testnet"), 20);
        let decision = contract.authorize_spend(
            "owner-release-check".into(),
            account("merchant.testnet"),
            10,
            1,
            500,
        );
        context(account("attacker.testnet"), 500);
        contract.release_expired_reservation(decision.decision_id);
    }

}
