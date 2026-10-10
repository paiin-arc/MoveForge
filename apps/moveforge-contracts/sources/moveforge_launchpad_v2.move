module moveforge::moveforge_launchpad_v2 {
    use aptos_framework::account;
    use aptos_framework::fungible_asset::{Self, Metadata};
    use aptos_framework::object::{Self, Object};
    use aptos_framework::primary_fungible_store;
    use aptos_framework::table::{Self, Table};
    use std::option;
    use std::signer;
    use std::string::{Self, String};
    use std::vector;

    const MAX_SUPPLY_TOKENS: u64 = 1_000_000_000;
    const TOKEN_DECIMALS: u8 = 8;
    const TOKEN_UNIT: u64 = 100_000_000;
    const MAX_SUPPLY_UNITS: u64 = 100_000_000_000_000_000;
    const MAX_CREATOR_ALLOCATION_BPS: u64 = 130;
    const BPS_DENOMINATOR: u64 = 10_000;

    const E_ALREADY_INITIALIZED: u64 = 1;
    const E_NOT_AUTHORIZED: u64 = 2;
    const E_INVALID_ALLOCATION: u64 = 3;
    const E_INVALID_NAME: u64 = 4;
    const E_INVALID_SYMBOL: u64 = 5;
    const E_DUPLICATE_LAUNCH: u64 = 6;

    /// Global V2 configuration, published under the module address.
    struct Config has key {
        admin: address,
        custody_cap: account::SignerCapability,
        launches: Table<address, Launch>,
    }

    /// Each launch is keyed by its fungible-asset metadata address.
    struct Launch has store {
        creator: address,
        metadata: Object<Metadata>,
        twitter_url: String,
        total_supply: u64,
        creator_allocation: u64,
        real_token_reserve: u64,
        active: bool,
    }

    /// Initialize once. Only the account at the module address may initialize.
    public entry fun initialize(admin: &signer) {
        let admin_address = signer::address_of(admin);

        assert!(admin_address == @moveforge, E_NOT_AUTHORIZED);
        assert!(!exists<Config>(@moveforge), E_ALREADY_INITIALIZED);

        let (custody_signer, custody_cap) =
            account::create_resource_account(admin, b"moveforge_v2_custody");

        let _custody_address = signer::address_of(&custody_signer);

        move_to(admin, Config {
            admin: admin_address,
            custody_cap,
            launches: table::new<address, Launch>(),
        });
    }

    /// Create a capped-supply token and allocate the non-creator supply
    /// to the launchpad's custody account for future trading.
    public entry fun create_launch(
        creator: &signer,
        name: String,
        symbol: String,
        icon_uri: String,
        project_uri: String,
        twitter_url: String,
        creator_allocation_bps: u64,
    ) acquires Config {
        assert!(exists<Config>(@moveforge), E_NOT_AUTHORIZED);
        assert!(string::length(&name) > 0, E_INVALID_NAME);
        assert!(string::length(&symbol) > 0, E_INVALID_SYMBOL);
        assert!(
            creator_allocation_bps <= MAX_CREATOR_ALLOCATION_BPS,
            E_INVALID_ALLOCATION
        );

        let creator_address = signer::address_of(creator);

        let creator_amount = (
            (MAX_SUPPLY_UNITS as u128)
                * (creator_allocation_bps as u128)
                / (BPS_DENOMINATOR as u128)
        ) as u64;

        let reserve_amount = MAX_SUPPLY_UNITS - creator_amount;

        let custody_address = {
            let config_ref = borrow_global<Config>(@moveforge);
            account::get_signer_capability_address(&config_ref.custody_cap)
        };

        // The seed is scoped to the creator address and includes labels so
        // adjacent name/symbol byte sequences cannot collide ambiguously.
        let seed = {
            let symbol_bytes = string::bytes(&symbol);
            let name_bytes = string::bytes(&name);
            let mut_seed = vector::empty<u8>();
            vector::append(&mut mut_seed, b"moveforge::launchpad_v2::fa::symbol=");
            vector::append(&mut mut_seed, *symbol_bytes);
            vector::append(&mut mut_seed, b";name=");
            vector::append(&mut mut_seed, *name_bytes);
            mut_seed
        };
        let constructor_ref = object::create_named_object(creator, seed);

        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            &constructor_ref,
            option::some(MAX_SUPPLY_UNITS as u128),
            name,
            symbol,
            TOKEN_DECIMALS,
            icon_uri,
            project_uri,
        );

        let metadata =
            object::object_from_constructor_ref<Metadata>(&constructor_ref);
        let metadata_address = object::object_address(&metadata);
        let mint_ref = fungible_asset::generate_mint_ref(&constructor_ref);

        if (creator_amount > 0) {
            let creator_asset = fungible_asset::mint(&mint_ref, creator_amount);
            primary_fungible_store::deposit(creator_address, creator_asset);
        };

        let reserve_asset = fungible_asset::mint(&mint_ref, reserve_amount);
        primary_fungible_store::deposit(custody_address, reserve_asset);

        let config = borrow_global_mut<Config>(@moveforge);
        assert!(
            !table::contains(&config.launches, metadata_address),
            E_DUPLICATE_LAUNCH
        );

        table::add(&mut config.launches, metadata_address, Launch {
            creator: creator_address,
            metadata,
            twitter_url,
            total_supply: MAX_SUPPLY_UNITS,
            creator_allocation: creator_amount,
            real_token_reserve: reserve_amount,
            active: true,
        });
    }

    /// Read-only allocation validation for tests and other modules.
    public fun validate_allocation(
        total_supply_tokens: u64,
        creator_allocation_tokens: u64,
    ) {
        assert!(
            total_supply_tokens == MAX_SUPPLY_TOKENS,
            E_INVALID_ALLOCATION
        );
        assert!(
            (creator_allocation_tokens as u128) * (BPS_DENOMINATOR as u128)
                <= (total_supply_tokens as u128)
                    * (MAX_CREATOR_ALLOCATION_BPS as u128),
            E_INVALID_ALLOCATION
        );
    }

    #[view]
    public fun constants(): (u64, u8, u64, u64) {
        (
            MAX_SUPPLY_UNITS,
            TOKEN_DECIMALS,
            MAX_CREATOR_ALLOCATION_BPS,
            BPS_DENOMINATOR,
        )
    }

    #[view]
    public fun quote_allocation(
        creator_allocation_bps: u64,
    ): (u64, u64) {
        assert!(
            creator_allocation_bps <= MAX_CREATOR_ALLOCATION_BPS,
            E_INVALID_ALLOCATION
        );

        let creator_amount = (
            (MAX_SUPPLY_UNITS as u128)
                * (creator_allocation_bps as u128)
                / (BPS_DENOMINATOR as u128)
        ) as u64;

        (creator_amount, MAX_SUPPLY_UNITS - creator_amount)
    }

    #[view]
    public fun launch_exists(metadata_address: address): bool acquires Config {
        if (!exists<Config>(@moveforge)) {
            false
        } else {
            let config = borrow_global<Config>(@moveforge);
            table::contains(&config.launches, metadata_address)
        }
    }

    #[view]
    public fun launch_details(
        metadata_address: address,
    ): (
        address,
        address,
        String,
        String,
        String,
        String,
        String,
        u64,
        u64,
        u64,
        bool,
    ) acquires Config {
        let config = borrow_global<Config>(@moveforge);
        let launch = table::borrow(&config.launches, metadata_address);

        (
            launch.creator,
            object::object_address(&launch.metadata),
            fungible_asset::name(launch.metadata),
            fungible_asset::symbol(launch.metadata),
            fungible_asset::icon_uri(launch.metadata),
            fungible_asset::project_uri(launch.metadata),
            launch.twitter_url,
            launch.total_supply,
            launch.creator_allocation,
            launch.real_token_reserve,
            launch.active,
        )
    }

    #[view]
    public fun custody_address(): address acquires Config {
        let config = borrow_global<Config>(@moveforge);
        account::get_signer_capability_address(&config.custody_cap)
    }

    #[test]
    fun test_valid_creator_allocation() {
        validate_allocation(1_000_000_000, 13_000_000);
    }

    #[test, expected_failure(abort_code = E_INVALID_ALLOCATION)]
    fun test_creator_allocation_over_limit() {
        validate_allocation(1_000_000_000, 13_000_001);
    }

    #[test, expected_failure(abort_code = E_INVALID_ALLOCATION)]
    fun test_wrong_total_supply() {
        validate_allocation(900_000_000, 10_000_000);
    }
}
