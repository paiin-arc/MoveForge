import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

export const MOVEFORGE_NETWORK = Network.TESTNET;
export const MOVEFORGE_FULLNODE = "https://fullnode.testnet.aptoslabs.com/v1";
export const MOVEFORGE_NETWORK_LABEL = "Aptos Testnet";
export const MOVEFORGE_ADDRESS =
  "0xbfabe1c1bc25784d17dbf389bdb25e534fe8188fa5a5b8a1c1f60cb7629d4cb3";
export const MOVEFORGE_V2_MODULE_NAME = "moveforge_launchpad_v2";
export const MOVEFORGE_V2_MODULE = `${MOVEFORGE_ADDRESS}::${MOVEFORGE_V2_MODULE_NAME}`;

export const aptos = new Aptos(
  new AptosConfig({
    network: MOVEFORGE_NETWORK,
    fullnode: MOVEFORGE_FULLNODE,
  }),
);
