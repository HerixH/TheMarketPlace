#![cfg(test)]

use super::*;
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

const PRICE: i128 = 25_0000000; // 25 USDC (7 decimals)

struct Setup<'a> {
    env: Env,
    escrow: EscrowContractClient<'a>,
    token: TokenClient<'a>,
    admin: Address,
    buyer: Address,
    seller: Address,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);

    let admin = Address::generate(&env);
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    StellarAssetClient::new(&env, &sac.address()).mint(&buyer, &(PRICE * 10));
    let token = TokenClient::new(&env, &sac.address());

    let escrow_id = env.register(EscrowContract, ());
    let escrow = EscrowContractClient::new(&env, &escrow_id);
    escrow.initialize(&admin, &sac.address());

    Setup {
        env,
        escrow,
        token,
        admin,
        buyer,
        seller,
    }
}

fn fund(s: &Setup, id: Symbol) {
    s.escrow
        .deposit(&id, &s.buyer, &s.seller, &PRICE, &(1_000 + 3600));
}

#[test]
fn deposit_locks_funds() {
    let s = setup();
    let id = symbol_short!("order1");
    fund(&s, id.clone());

    assert_eq!(s.token.balance(&s.buyer), PRICE * 9);
    assert_eq!(s.token.balance(&s.escrow.address), PRICE);
    let e = s.escrow.get(&id);
    assert_eq!(e.status, Status::Funded);
    assert_eq!(e.amount, PRICE);
}

#[test]
fn buyer_release_pays_seller() {
    let s = setup();
    let id = symbol_short!("order1");
    fund(&s, id.clone());
    s.escrow.release(&id);

    assert_eq!(s.token.balance(&s.seller), PRICE);
    assert_eq!(s.token.balance(&s.escrow.address), 0);
    assert_eq!(s.escrow.get(&id).status, Status::Released);
}

#[test]
fn seller_refund_returns_funds() {
    let s = setup();
    let id = symbol_short!("order1");
    fund(&s, id.clone());
    s.escrow.refund(&id);

    assert_eq!(s.token.balance(&s.buyer), PRICE * 10);
    assert_eq!(s.escrow.get(&id).status, Status::Refunded);
}

#[test]
fn dispute_then_split() {
    let s = setup();
    let id = symbol_short!("order1");
    fund(&s, id.clone());
    s.escrow.dispute(&id, &s.buyer);
    assert_eq!(s.escrow.get(&id).status, Status::Disputed);

    let to_seller = 10_0000000;
    s.escrow.resolve(&id, &to_seller);

    assert_eq!(s.token.balance(&s.seller), to_seller);
    assert_eq!(s.token.balance(&s.buyer), PRICE * 9 + (PRICE - to_seller));
    assert_eq!(s.token.balance(&s.escrow.address), 0);
    assert_eq!(s.escrow.get(&id).status, Status::Resolved);
    let _ = &s.admin;
}

#[test]
fn seller_can_claim_only_after_deadline() {
    let s = setup();
    let id = symbol_short!("order1");
    fund(&s, id.clone());

    assert_eq!(
        s.escrow.try_claim(&id),
        Err(Ok(Error::DeadlineNotReached))
    );

    s.env.ledger().set_timestamp(1_000 + 3601);
    s.escrow.claim(&id);
    assert_eq!(s.token.balance(&s.seller), PRICE);
    assert_eq!(s.escrow.get(&id).status, Status::Claimed);
}

#[test]
fn disputed_escrow_cannot_be_claimed_or_released() {
    let s = setup();
    let id = symbol_short!("order1");
    fund(&s, id.clone());
    s.escrow.dispute(&id, &s.seller);

    s.env.ledger().set_timestamp(1_000 + 7200);
    assert_eq!(s.escrow.try_claim(&id), Err(Ok(Error::InvalidState)));
    assert_eq!(s.escrow.try_release(&id), Err(Ok(Error::InvalidState)));
    assert_eq!(s.escrow.try_refund(&id), Err(Ok(Error::InvalidState)));
}

#[test]
fn outsiders_cannot_dispute() {
    let s = setup();
    let id = symbol_short!("order1");
    fund(&s, id.clone());
    let stranger = Address::generate(&s.env);
    assert_eq!(
        s.escrow.try_dispute(&id, &stranger),
        Err(Ok(Error::NotAParty))
    );
}

#[test]
fn cannot_settle_twice() {
    let s = setup();
    let id = symbol_short!("order1");
    fund(&s, id.clone());
    s.escrow.release(&id);
    assert_eq!(s.escrow.try_release(&id), Err(Ok(Error::InvalidState)));
    assert_eq!(s.escrow.try_refund(&id), Err(Ok(Error::InvalidState)));
}

#[test]
fn rejects_bad_input() {
    let s = setup();
    let id = symbol_short!("order1");

    assert_eq!(
        s.escrow
            .try_deposit(&id, &s.buyer, &s.seller, &0, &(1_000 + 3600)),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        s.escrow
            .try_deposit(&id, &s.buyer, &s.buyer, &PRICE, &(1_000 + 3600)),
        Err(Ok(Error::SameParty))
    );
    assert_eq!(
        s.escrow.try_deposit(&id, &s.buyer, &s.seller, &PRICE, &500),
        Err(Ok(Error::InvalidDeadline))
    );

    fund(&s, id.clone());
    assert_eq!(
        s.escrow
            .try_deposit(&id, &s.buyer, &s.seller, &PRICE, &(1_000 + 3600)),
        Err(Ok(Error::EscrowExists))
    );
    assert_eq!(
        s.escrow.try_resolve(&id, &PRICE),
        Err(Ok(Error::InvalidState))
    );
    s.escrow.dispute(&id, &s.buyer);
    assert_eq!(
        s.escrow.try_resolve(&id, &(PRICE + 1)),
        Err(Ok(Error::InvalidSplit))
    );
}

#[test]
fn cannot_initialize_twice() {
    let s = setup();
    assert_eq!(
        s.escrow.try_initialize(&s.admin, &s.token.address),
        Err(Ok(Error::AlreadyInitialized))
    );
}
