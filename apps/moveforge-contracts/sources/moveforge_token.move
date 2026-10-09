module moveforge::moveforge_token {
     
    use aptos_framework::fungible_asset;
    use aptos_framework::object;
    use aptos_framework::primary_fungible_store;
    use std::event;
    use std::option;
    use std::signer;
    use std::string;

    const E_INVALID_NAME: u64 = 1;
    const E_INVALID_SYMBOL: u64 = 2;
    const E_INVALID_DECIMALS: u64 = 3;
    const E_INVALID_SUPPLY: u64 = 4;

    #[event]
    struct TokenCreated has drop, store {
        creator: address,
        metadata_address: address,
        initial_supply: u64,
    }

    public entry fun create_token(
        creator: &signer,
        name: string::String,
        symbol: string::String,
        decimals: u8,
        initial_supply: u64,
    ) {
        assert!(string::length(&name) > 0, E_INVALID_NAME);
        assert!(string::length(&symbol) > 0, E_INVALID_SYMBOL);
        assert!(decimals <= 18, E_INVALID_DECIMALS);
        assert!(initial_supply > 0, E_INVALID_SUPPLY);

        let creator_address = signer::address_of(creator);

        // The creator and ticker determine this token's named-object address.
        let seed = *string::bytes(&symbol);
        let constructor_ref =
            object::create_named_object(creator, seed);

        // Cap the total supply at the requested initial supply.
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            &constructor_ref,
            option::some(initial_supply as u128),
            name,
            symbol,
            decimals,
            string::utf8(b""),
            string::utf8(b""),
        );

        let metadata_address =
            object::address_from_constructor_ref(&constructor_ref);

        // Mint the entire supply to the creator.
        let mint_ref =
            fungible_asset::generate_mint_ref(&constructor_ref);

        primary_fungible_store::mint(
            &mint_ref,
            creator_address,
            initial_supply,
        );

        // The mint capability is not stored or exposed publicly.
        event::emit(TokenCreated {
            creator: creator_address,
            metadata_address,
            initial_supply,
        });
    }

    #[test(symbol = @moveforge)]
    #[expected_failure(
        abort_code = 2,
        location = moveforge::moveforge_token
    )]
    fun test_create_token_rejects_empty_symbol(symbol: &signer) {
        create_token(
            symbol,
            string::utf8(b"Test Token"),
            string::utf8(b""),
            6,
            1000000,
        );
    }

    #[test(creator = @moveforge)]
    #[expected_failure(
        abort_code = 3,
        location = moveforge::moveforge_token
    )]
    fun test_create_token_rejects_invalid_decimals(creator: &signer) {
        create_token(
            creator,
            string::utf8(b"Test Token"),
            string::utf8(b"TEST"),
            19,
            1000000,
        );
    }

    #[test(creator = @moveforge)]
    #[expected_failure(
        abort_code = 4,
        location = moveforge::moveforge_token
    )]
    fun test_create_token_rejects_zero_supply(creator: &signer) {
        create_token(
            creator,
            string::utf8(b"Test Token"),
            string::utf8(b"TEST"),
            6,
            0,
         );
    }

    #[test(creator = @moveforge)]
    #[expected_failure(
        abort_code = 1,
        location = moveforge::moveforge_token
    )]
    fun test_create_token_rejects_empty_name(creator: &signer) {
        create_token(
            creator,
            string::utf8(b""),
            string::utf8(b"TEST"),
            6,
            1000000,
        );
    }

    #[test(creator = @moveforge)]
    fun test_create_token_success(creator: &signer) {
        let name = string::utf8(b"MoveForge Unit Test");
        let symbol = string::utf8(b"MFTUNIT");
        let decimals = 6;
        let initial_supply = 1000000;

        create_token(
            creator,
            name,
            symbol,
            decimals,
            initial_supply,
        );
    }


}       
     
