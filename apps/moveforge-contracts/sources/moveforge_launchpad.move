module moveforge::moveforge_launchpad {
    const BPS_DENOMINATOR: u128 = 10000;

    const E_INVALID_RESERVES: u64 = 1;
    const E_INVALID_INPUT: u64 = 2;
    const E_INVALID_FEE: u64 = 3;
    const E_INSUFFICIENT_LIQUIDITY: u64 = 4;

    /// Round division up so integer rounding does not overpay traders.
    fun ceil_div(numerator: u128, denominator: u128): u128 {
        assert!(denominator > 0, E_INVALID_RESERVES);

        let quotient = numerator / denominator;
        let remainder = numerator % denominator;

        if (remainder == 0) {
            quotient
        } else {
            quotient + 1
        }
    }

    /// Calculate tokens received for an APT input.
    /// Reserves and input amounts use the smallest on-chain units.
    public fun quote_buy(
        virtual_apt_reserve: u128,
        virtual_token_reserve: u128,
        real_token_reserve: u64,
        apt_in: u64,
        fee_bps: u64,
    ): u64 {
        assert!(
            virtual_apt_reserve > 0 && virtual_token_reserve > 0,
            E_INVALID_RESERVES
        );
        assert!(apt_in > 0, E_INVALID_INPUT);
        assert!(fee_bps < 10000, E_INVALID_FEE);

        let fee = ((apt_in as u128) * (fee_bps as u128))
            / BPS_DENOMINATOR;
        let net_apt = (apt_in as u128) - fee;

        assert!(net_apt > 0, E_INVALID_INPUT);

        let curve_product =
            virtual_apt_reserve * virtual_token_reserve;
        let next_apt_reserve = virtual_apt_reserve + net_apt;
        let next_token_reserve =
            ceil_div(curve_product, next_apt_reserve);

        assert!(
            next_token_reserve < virtual_token_reserve,
            E_INVALID_INPUT
        );

        let tokens_out =
            virtual_token_reserve - next_token_reserve;

        assert!(
            tokens_out <= (real_token_reserve as u128),
            E_INSUFFICIENT_LIQUIDITY
        );

        tokens_out as u64
    }

    /// Calculate APT received for selling tokens back to the curve.
    /// real_apt_reserve is the spendable APT reserve, not a virtual reserve.
    public fun quote_sell(
        virtual_apt_reserve: u128,
        virtual_token_reserve: u128,
        real_apt_reserve: u64,
        tokens_in: u64,
        fee_bps: u64,
    ): u64 {
        assert!(
            virtual_apt_reserve > 0 && virtual_token_reserve > 0,
            E_INVALID_RESERVES
        );
        assert!(tokens_in > 0, E_INVALID_INPUT);
        assert!(fee_bps < 10000, E_INVALID_FEE);

        let curve_product =
            virtual_apt_reserve * virtual_token_reserve;
        let next_token_reserve =
            virtual_token_reserve + (tokens_in as u128);
        let next_apt_reserve =
            ceil_div(curve_product, next_token_reserve);

        assert!(
            next_apt_reserve < virtual_apt_reserve,
            E_INVALID_INPUT
        );

        let gross_apt =
            virtual_apt_reserve - next_apt_reserve;
        let fee =
            (gross_apt * (fee_bps as u128)) / BPS_DENOMINATOR;
        let net_apt = gross_apt - fee;

        assert!(
            net_apt <= (real_apt_reserve as u128),
            E_INSUFFICIENT_LIQUIDITY
        );

        net_apt as u64
    }

    #[test]
    fun test_buy_quote_is_positive() {
        let tokens_out = quote_buy(
            1_000_000_000,
            1_000_000_000,
            1_000_000_000,
            10_000,
            100,
        );

        assert!(tokens_out > 0, 10);
        assert!(tokens_out < 1_000_000_000, 11);
    }

    #[test]
    fun test_sell_quote_is_positive() {
        let apt_out = quote_sell(
            1_000_000_000,
            1_000_000_000,
            1_000_000_000,
            10_000,
            100,
        );

        assert!(apt_out > 0, 12);
        assert!(apt_out < 1_000_000_000, 13);
    }
}
