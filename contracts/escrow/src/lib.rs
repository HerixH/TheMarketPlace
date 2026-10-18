#![no_std]

//! Marketplace escrow for USDC (or any SEP-41 token) on Soroban.
//!
//! Flow:
//!   buyer  -> `deposit`   funds move buyer -> contract
//!   buyer  -> `release`   funds move contract -> seller   (delivery confirmed)
//!   seller -> `refund`    funds move contract -> buyer    (seller cancels)
//!   either -> `dispute`   freezes the escrow
//!   admin  -> `resolve`   arbiter splits a disputed escrow between both parties
//!   seller -> `claim`     after the release deadline, if the buyer never
//!                         confirmed and nobody opened a dispute

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Env, Symbol,
};

/// Roughly 30 days worth of ledgers (5s per ledger).
const TTL_THRESHOLD: u32 = 518_400;
const TTL_EXTEND_TO: u32 = 1_036_800;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    EscrowExists = 4,
    EscrowNotFound = 5,
    InvalidState = 6,
    NotAParty = 7,
    DeadlineNotReached = 8,
    InvalidSplit = 9,
    InvalidDeadline = 10,
    SameParty = 11,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Status {
    Funded,
    Released,
    Refunded,
    Disputed,
    Resolved,
    Claimed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Escrow {
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    /// Unix timestamp after which the seller may `claim` the funds.
    pub release_after: u64,
    pub status: Status,
}

#[contracttype]
enum DataKey {
    Admin,
    Token,
    Escrow(Symbol),
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// One-time setup. `admin` is the arbiter that resolves disputes,
    /// `token` is the SAC address of the payment asset (USDC).
    pub fn initialize(env: Env, admin: Address, token: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        Ok(())
    }

    /// Buyer locks `amount` in escrow for `order_id`.
    /// `release_after` is a unix timestamp after which the seller can claim
    /// the funds if the buyer never confirms delivery or disputes.
    pub fn deposit(
        env: Env,
        order_id: Symbol,
        buyer: Address,
        seller: Address,
        amount: i128,
        release_after: u64,
    ) -> Result<(), Error> {
        buyer.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if buyer == seller {
            return Err(Error::SameParty);
        }
        if release_after <= env.ledger().timestamp() {
            return Err(Error::InvalidDeadline);
        }
        let key = DataKey::Escrow(order_id);
        if env.storage().persistent().has(&key) {
            return Err(Error::EscrowExists);
        }

        token_client(&env)?.transfer(&buyer, &env.current_contract_address(), &amount);

        let escrow = Escrow {
            buyer,
            seller,
            amount,
            release_after,
            status: Status::Funded,
        };
        save(&env, &key, &escrow);
        Ok(())
    }

    /// Buyer confirms delivery: funds go to the seller.
    pub fn release(env: Env, order_id: Symbol) -> Result<(), Error> {
        let key = DataKey::Escrow(order_id);
        let mut escrow = load(&env, &key)?;
        escrow.buyer.require_auth();
        require_status(&escrow, Status::Funded)?;

        token_client(&env)?.transfer(
            &env.current_contract_address(),
            &escrow.seller,
            &escrow.amount,
        );
        escrow.status = Status::Released;
        save(&env, &key, &escrow);
        Ok(())
    }

    /// Seller cancels the sale: funds go back to the buyer.
    pub fn refund(env: Env, order_id: Symbol) -> Result<(), Error> {
        let key = DataKey::Escrow(order_id);
        let mut escrow = load(&env, &key)?;
        escrow.seller.require_auth();
        require_status(&escrow, Status::Funded)?;

        token_client(&env)?.transfer(
            &env.current_contract_address(),
            &escrow.buyer,
            &escrow.amount,
        );
        escrow.status = Status::Refunded;
        save(&env, &key, &escrow);
        Ok(())
    }

    /// Either party freezes the escrow until the arbiter resolves it.
    pub fn dispute(env: Env, order_id: Symbol, caller: Address) -> Result<(), Error> {
        caller.require_auth();
        let key = DataKey::Escrow(order_id);
        let mut escrow = load(&env, &key)?;
        if caller != escrow.buyer && caller != escrow.seller {
            return Err(Error::NotAParty);
        }
        require_status(&escrow, Status::Funded)?;

        escrow.status = Status::Disputed;
        save(&env, &key, &escrow);
        Ok(())
    }

    /// Arbiter splits a disputed escrow: `to_seller` goes to the seller and
    /// the remainder to the buyer.
    pub fn resolve(env: Env, order_id: Symbol, to_seller: i128) -> Result<(), Error> {
        let admin = admin(&env)?;
        admin.require_auth();

        let key = DataKey::Escrow(order_id);
        let mut escrow = load(&env, &key)?;
        require_status(&escrow, Status::Disputed)?;
        if to_seller < 0 || to_seller > escrow.amount {
            return Err(Error::InvalidSplit);
        }

        let token = token_client(&env)?;
        let contract = env.current_contract_address();
        if to_seller > 0 {
            token.transfer(&contract, &escrow.seller, &to_seller);
        }
        let to_buyer = escrow.amount - to_seller;
        if to_buyer > 0 {
            token.transfer(&contract, &escrow.buyer, &to_buyer);
        }
        escrow.status = Status::Resolved;
        save(&env, &key, &escrow);
        Ok(())
    }

    /// Seller collects the funds once the release deadline has passed and
    /// the escrow was neither confirmed nor disputed.
    pub fn claim(env: Env, order_id: Symbol) -> Result<(), Error> {
        let key = DataKey::Escrow(order_id);
        let mut escrow = load(&env, &key)?;
        escrow.seller.require_auth();
        require_status(&escrow, Status::Funded)?;
        if env.ledger().timestamp() < escrow.release_after {
            return Err(Error::DeadlineNotReached);
        }

        token_client(&env)?.transfer(
            &env.current_contract_address(),
            &escrow.seller,
            &escrow.amount,
        );
        escrow.status = Status::Claimed;
        save(&env, &key, &escrow);
        Ok(())
    }

    pub fn get(env: Env, order_id: Symbol) -> Result<Escrow, Error> {
        load(&env, &DataKey::Escrow(order_id))
    }

    pub fn admin(env: Env) -> Result<Address, Error> {
        admin(&env)
    }

    pub fn token(env: Env) -> Result<Address, Error> {
        token_address(&env)
    }
}

fn admin(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(Error::NotInitialized)
}

fn token_address(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Token)
        .ok_or(Error::NotInitialized)
}

fn token_client(env: &Env) -> Result<token::Client<'_>, Error> {
    Ok(token::Client::new(env, &token_address(env)?))
}

fn load(env: &Env, key: &DataKey) -> Result<Escrow, Error> {
    let escrow: Escrow = env
        .storage()
        .persistent()
        .get(key)
        .ok_or(Error::EscrowNotFound)?;
    Ok(escrow)
}

fn save(env: &Env, key: &DataKey, escrow: &Escrow) {
    env.storage().persistent().set(key, escrow);
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn require_status(escrow: &Escrow, expected: Status) -> Result<(), Error> {
    if escrow.status != expected {
        return Err(Error::InvalidState);
    }
    Ok(())
}

#[cfg(test)]
mod test;
