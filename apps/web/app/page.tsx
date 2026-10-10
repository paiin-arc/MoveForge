

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { AccountAddress, createObjectAddress } from "@aptos-labs/ts-sdk";
import {
  MOVEFORGE_ADDRESS,
  MOVEFORGE_FULLNODE,
  MOVEFORGE_NETWORK,
  MOVEFORGE_NETWORK_LABEL,
  MOVEFORGE_V2_MODULE,
  MOVEFORGE_V2_MODULE_NAME,
  aptos,
} from "./aptosConfig";

const TOTAL_SUPPLY_UNITS = BigInt("100000000000000000");
const TOKEN_DECIMALS = 8;
const MAX_CREATOR_ALLOCATION_BPS = 130;
const BPS_DENOMINATOR = 10_000;
const IMAGE_UPLOAD_ENDPOINT = "/api/token-image";
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type TxState = "idle" | "pending" | "success" | "failure";

type CreatedLaunch = {
  name: string;
  symbol: string;
  metadataAddress: string;
  transactionHash: string;
  creator: string;
  totalSupply: string;
  creatorAllocation: string;
  reserveAllocation: string;
  creatorAllocationBps: number;
  imageUrl: string;
  websiteUrl: string;
  twitterUrl: string;
  active: boolean;
};

// Launches created in this browser. localStorage is only a pointer list;
// the on-chain `launch_details` view is the source of truth for each record.
const LAUNCH_STORAGE_KEY = "moveforge.v2.launches";
const EXPLORER_BASE = "https://explorer.aptoslabs.com";

type StoredLaunch = {
  metadataAddress: string;
  transactionHash: string;
  creatorAllocationBps: number;
  createdAt: number;
};

type LaunchRecord = StoredLaunch & {
  name: string;
  symbol: string;
  imageUrl: string;
  websiteUrl: string;
  twitterUrl: string;
  creator: string;
  totalSupply: string;
  creatorAllocation: string;
  reserveAllocation: string;
  active: boolean;
  detailsUnavailable: boolean;
};

function isStoredLaunch(value: unknown): value is StoredLaunch {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.metadataAddress === "string" &&
    typeof record.transactionHash === "string" &&
    typeof record.creatorAllocationBps === "number" &&
    typeof record.createdAt === "number"
  );
}

function loadStoredLaunches(): StoredLaunch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LAUNCH_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isStoredLaunch) : [];
  } catch {
    return [];
  }
}

function saveStoredLaunch(launch: StoredLaunch) {
  if (typeof window === "undefined") return;
  const existing = loadStoredLaunches().filter(
    (item) => item.metadataAddress !== launch.metadataAddress,
  );
  const next = [...existing, launch].sort((a, b) => b.createdAt - a.createdAt);
  window.localStorage.setItem(LAUNCH_STORAGE_KEY, JSON.stringify(next));
}

function explorerTxUrl(hash: string) {
  return `${EXPLORER_BASE}/txn/${hash}?network=testnet`;
}

function explorerObjectUrl(address: string) {
  return `${EXPLORER_BASE}/object/${address}?network=testnet`;
}

function explorerAccountUrl(address: string) {
  return `${EXPLORER_BASE}/account/${address}?network=testnet`;
}

function shortHex(value: string, head = 8, tail = 6) {
  return value.length > head + tail + 2
    ? `${value.slice(0, head + 2)}...${value.slice(-tail)}`
    : value;
}

function buildLaunchSeed(symbol: string, name: string) {
  return new TextEncoder().encode(
    `moveforge::launchpad_v2::fa::symbol=${symbol};name=${name}`,
  );
}

function formatTokenUnits(value: bigint) {
  const base = BigInt(10) ** BigInt(TOKEN_DECIMALS);
  const whole = value / base;
  const fraction = value % base;

  if (fraction === BigInt(0)) {
    return whole.toLocaleString("en-US");
  }

  const fractionText = fraction
    .toString()
    .padStart(TOKEN_DECIMALS, "0")
    .replace(/0+$/, "");

  return `${whole.toLocaleString("en-US")}.${fractionText}`;
}

function allocationFromBps(creatorAllocationBps: number) {
  const creatorAllocation =
    (TOTAL_SUPPLY_UNITS * BigInt(creatorAllocationBps)) /
    BigInt(BPS_DENOMINATOR);
  return {
    creatorAllocation,
    reserveAllocation: TOTAL_SUPPLY_UNITS - creatorAllocation,
  };
}

function normalizeOptionalUrl(value: string) {
  return value.trim();
}

function isValidOptionalUrl(value: string) {
  if (!value) return true;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function formatWalletNetworkName(value: string | undefined) {
  if (!value) return "Not connected";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function validateImageFile(file: File) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return "Image must be PNG, JPG, WebP, or GIF.";
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return "Image must be 2 MB or smaller.";
  }

  return "";
}

async function uploadLaunchImage(
  file: File,
  onProgress: (progress: number) => void,
) {
  const validationError = validateImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const formData = new FormData();
  formData.append("file", file);

  const responseBody = await new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", IMAGE_UPLOAD_ENDPOINT);
    request.responseType = "text";

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve(request.responseText);
        return;
      }

      try {
        const body = JSON.parse(request.responseText) as { error?: unknown };
        reject(
          new Error(
            typeof body.error === "string"
              ? body.error
              : `Image upload failed with status ${request.status}.`,
          ),
        );
      } catch {
        reject(new Error(`Image upload failed with status ${request.status}.`));
      }
    };

    request.onerror = () => {
      reject(new Error("Image upload failed due to a network error."));
    };

    request.send(formData);
  });

  const body = JSON.parse(responseBody) as { url?: unknown };
  if (typeof body.url !== "string" || !isValidOptionalUrl(body.url)) {
    throw new Error("Image upload response must include a public URL.");
  }

  return body.url;
}

const navigation = [

  { label: "Search", icon: "search" },

  { label: "Create a Token", icon: "plus" },

  { label: "Launches", icon: "grid" },

  { label: "My Portfolio", icon: "layers" },

  { label: "Analytics", icon: "chart" },

  { label: "Notifications", icon: "bell" },

];

function Icon({

  name,

  size = 18,

}: {

  name: string;

  size?: number;

}) {

  const common = {

    width: size,

    height: size,

    viewBox: "0 0 24 24",

    fill: "none",

    stroke: "currentColor",

    strokeWidth: 1.7,

    strokeLinecap: "round" as const,

    strokeLinejoin: "round" as const,

    "aria-hidden": true as const,

  };

  switch (name) {

    case "search":

      return (

        <svg {...common}>

          <circle cx="10.8" cy="10.8" r="6.8" />

          <path d="m16 16 4 4" />

        </svg>

      );

    case "plus":

      return (

        <svg {...common}>

          <path d="M12 5v14M5 12h14" />

        </svg>

      );

    case "grid":

      return (

        <svg {...common}>

          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />

          <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />

          <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />

          <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />

        </svg>

      );

    case "layers":

      return (

        <svg {...common}>

          <path d="m12 3 9 5-9 5-9-5 9-5Z" />

          <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />

        </svg>

      );

    case "chart":

      return (

        <svg {...common}>

          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />

        </svg>

      );

    case "bell":

      return (

        <svg {...common}>

          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />

          <path d="M10 21h4" />

        </svg>

      );

    case "settings":

      return (

        <svg {...common}>

          <circle cx="12" cy="12" r="3" />

          <path d="m19.4 15 .1.1 1.2.9-1.2 2.1-1.4-.5a8 8 0 0 1-1.6.9l-.2 1.5h-2.5l-.3-1.5a8 8 0 0 1-1.6-.9l-1.4.5-1.2-2.1 1.2-.9a7 7 0 0 1 0-1.9l-1.2-.9 1.2-2.1 1.4.5a8 8 0 0 1 1.6-.9l.3-1.5h2.5l.2 1.5a8 8 0 0 1 1.6.9l1.4-.5 1.2 2.1-1.2.9a7 7 0 0 1-.1 1.8Z" transform="translate(-1 -1) scale(1.08)" />

        </svg>

      );

    case "arrow":

      return (

        <svg {...common}>

          <path d="M7 17 17 7M7 7h10v10" />

        </svg>

      );

    case "copy":

      return (

        <svg {...common}>

          <rect width="13" height="13" x="9" y="9" rx="2" />

          <path d="M5 15c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2" />

        </svg>

      );

    case "check":

      return (

        <svg {...common}>

          <path d="M20 6 9 17l-5-5" />

        </svg>

      );

    default:

      return null;

  }

}

/// Copies the exact given address to the clipboard and shows brief feedback.
/// Lives beside address text/links as a sibling so it never triggers them.
function CopyButton({ value }: { value: string }) {
  const [feedback, setFeedback] = useState<"idle" | "copied" | "error">("idle");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback("copied");
    } catch {
      setFeedback("error");
    }

    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setFeedback("idle"), 2000);
  };

  return (
    <button
      type="button"
      onClick={copyToClipboard}
      aria-label="Copy address to clipboard"
      className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-1.5 transition ${
        feedback === "copied"
          ? "border-[#BFE3B7] bg-[#F2FAEF] text-[#367849]"
          : feedback === "error"
            ? "border-[#F0C8C8] bg-[#FFF6F6] text-[#A44747]"
            : "border-[#E6EAE3] text-[#687368] hover:bg-[#F5F7F2]"
      }`}
    >
      <Icon name={feedback === "copied" ? "check" : "copy"} size={12} />
      {feedback === "copied" && (
        <span className="text-[10px] font-semibold">Copied!</span>
      )}
      {feedback === "error" && (
        <span className="text-[10px] font-semibold">Copy failed</span>
      )}
    </button>
  );
}

export default function Home() {

  const [search, setSearch] = useState("");

  const [activeNav, setActiveNav] = useState("Launches");

  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const {
    connect,
    disconnect,
    account,
    connected,
    network,
    wallets,
    signAndSubmitTransaction,
  } = useWallet();
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [walletBusy, setWalletBusy] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState("");
  const [creatorAllocationBps, setCreatorAllocationBps] = useState(0);
  const [createState, setCreateState] = useState<TxState>("idle");
  const [createMessage, setCreateMessage] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [imageError, setImageError] = useState("");
  const [createdLaunch, setCreatedLaunch] = useState<CreatedLaunch | null>(
    null,
  );

  const walletAddress = account?.address ? account.address.toString() : "";
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : "";
  const walletNetworkName = network?.name?.toString();
  const isWalletOnMoveForgeNetwork =
    !connected || walletNetworkName === MOVEFORGE_NETWORK;

  const [launchRecords, setLaunchRecords] = useState<LaunchRecord[]>([]);
  const [launchRefresh, setLaunchRefresh] = useState<
    "idle" | "loading" | "error"
  >("idle");

  const imagePreviewUrl = useMemo(() => {
    if (!imageFile) return "";
    return URL.createObjectURL(imageFile);
  }, [imageFile]);

  useEffect(() => {
    if (!imagePreviewUrl) return;
    return () => URL.revokeObjectURL(imagePreviewUrl);
  }, [imagePreviewUrl]);

  const refreshLaunches = useCallback(async () => {
    setLaunchRefresh("loading");
    const stored = loadStoredLaunches();
    const records: LaunchRecord[] = [];
    let anyFailure = false;

    for (const storedLaunch of stored) {
      try {
        const details = await aptos.view<
          [string, string, string, string, string, string, string, string, string, string, boolean]
        >({
          payload: {
            function: `${MOVEFORGE_V2_MODULE}::launch_details`,
            functionArguments: [storedLaunch.metadataAddress],
          },
        });

        records.push({
          ...storedLaunch,
          creator: details[0],
          name: details[2],
          symbol: details[3],
          imageUrl: details[4],
          websiteUrl: details[5],
          twitterUrl: details[6],
          totalSupply: formatTokenUnits(BigInt(details[7])),
          creatorAllocation: formatTokenUnits(BigInt(details[8])),
          reserveAllocation: formatTokenUnits(BigInt(details[9])),
          active: details[10],
          detailsUnavailable: false,
        });
      } catch {
        anyFailure = true;
        records.push({
          ...storedLaunch,
          creator: "",
          name: "Unknown launch",
          symbol: "",
          imageUrl: "",
          websiteUrl: "",
          twitterUrl: "",
          totalSupply: "",
          creatorAllocation: "",
          reserveAllocation: "",
          active: false,
          detailsUnavailable: true,
        });
      }
    }

    setLaunchRecords(records);
    setLaunchRefresh(anyFailure ? "error" : "idle");
  }, []);

  useEffect(() => {
    const initialRefresh = setTimeout(() => void refreshLaunches(), 0);
    return () => clearTimeout(initialRefresh);
  }, [refreshLaunches]);

  const normalizedName = tokenName.trim();
  const normalizedSymbol = tokenSymbol.trim().toUpperCase();
  const normalizedWebsiteUrl = normalizeOptionalUrl(websiteUrl);
  const normalizedTwitterUrl = normalizeOptionalUrl(twitterUrl);
  const allocationPreview = allocationFromBps(creatorAllocationBps);
  const canCreate =
    connected &&
    isWalletOnMoveForgeNetwork &&
    normalizedName.length > 0 &&
    normalizedSymbol.length > 0 &&
    (!imageFile || !validateImageFile(imageFile)) &&
    isValidOptionalUrl(normalizedWebsiteUrl) &&
    isValidOptionalUrl(normalizedTwitterUrl) &&
    creatorAllocationBps >= 0 &&
    creatorAllocationBps <= MAX_CREATOR_ALLOCATION_BPS &&
    createState !== "pending";

  const launchRefreshLoading = launchRefresh === "loading";
  const visibleLaunchRecords = launchRecords.filter((record) => {
    const query = search.trim().toLowerCase();
    return (
      !query || `${record.name} ${record.symbol}`.toLowerCase().includes(query)
    );
  });

  const createLaunch = async () => {
    if (!connected || !account?.address) {
      setCreateState("failure");
      setCreateMessage("Connect an Aptos wallet before creating a launch.");
      return;
    }

    if (!isWalletOnMoveForgeNetwork) {
      setCreateState("failure");
      setCreateMessage(
        `Your wallet is connected to ${formatWalletNetworkName(walletNetworkName)}, but MoveForge V2 is configured for ${MOVEFORGE_NETWORK_LABEL}. Switch networks in your wallet and try again.`,
      );
      return;
    }

    if (!normalizedName || !normalizedSymbol) {
      setCreateState("failure");
      setCreateMessage("Token name and ticker are required.");
      return;
    }

    if (
      creatorAllocationBps < 0 ||
      creatorAllocationBps > MAX_CREATOR_ALLOCATION_BPS
    ) {
      setCreateState("failure");
      setCreateMessage("Creator allocation must be between 0% and 1.3%.");
      return;
    }

    if (!isValidOptionalUrl(normalizedWebsiteUrl)) {
      setCreateState("failure");
      setCreateMessage("Website URL must start with http:// or https://.");
      return;
    }

    if (!isValidOptionalUrl(normalizedTwitterUrl)) {
      setCreateState("failure");
      setCreateMessage("X/Twitter URL must start with http:// or https://.");
      return;
    }

    if (imageFile) {
      const validationError = validateImageFile(imageFile);
      if (validationError) {
        setCreateState("failure");
        setCreateMessage(validationError);
        return;
      }
    }

    const creatorAddress = account.address.toString();
    const metadataAddress = createObjectAddress(
      AccountAddress.from(creatorAddress),
      buildLaunchSeed(normalizedSymbol, normalizedName),
    ).toStringLong();

    setCreateState("pending");
    setCreateMessage("Checking MoveForge V2 deployment on Aptos Testnet...");
    setUploadMessage("");
    setCreatedLaunch(null);

    try {
      try {
        await aptos.getAccountModule({
          accountAddress: MOVEFORGE_ADDRESS,
          moduleName: MOVEFORGE_V2_MODULE_NAME,
        });
      } catch {
        throw new Error(
          `MoveForge V2 is not published at ${MOVEFORGE_ADDRESS} on ${MOVEFORGE_NETWORK_LABEL}. No launch transaction was submitted.`,
        );
      }

      try {
        const exists = await aptos.view<[boolean]>({
          payload: {
            function: `${MOVEFORGE_V2_MODULE}::launch_exists`,
            functionArguments: [metadataAddress],
          },
        });
        if (exists[0]) {
          throw new Error(
            `A launch already exists for ${normalizedSymbol} by this wallet. Pick a different name or ticker — no transaction was submitted.`,
          );
        }
      } catch (error) {
        // A failed preflight query must not block the launch; the contract
        // itself aborts duplicate named objects before any state changes.
        if (error instanceof Error && error.message.includes("already exists")) {
          throw error;
        }
      }

      let imageUrl = uploadedImageUrl;
      if (imageFile && !imageUrl) {
        setUploadProgress(0);
        setUploadMessage("Uploading token image to persistent storage...");
        imageUrl = await uploadLaunchImage(imageFile, setUploadProgress);
        setUploadedImageUrl(imageUrl);
        setUploadMessage("Token image uploaded.");
      }

      setCreateMessage("Waiting for wallet approval...");

      const response = await signAndSubmitTransaction({
        data: {
          function: `${MOVEFORGE_V2_MODULE}::create_launch`,
          functionArguments: [
            normalizedName,
            normalizedSymbol,
            imageUrl,
            normalizedWebsiteUrl,
            normalizedTwitterUrl,
            creatorAllocationBps,
          ],
        },
      });

      setCreateMessage("Transaction submitted. Waiting for Aptos finality...");

      const committed = await aptos.waitForTransaction({
        transactionHash: response.hash,
        options: {
          checkSuccess: true,
        },
      });

      let creator: string = creatorAddress;
      let launchName = normalizedName;
      let launchSymbol = normalizedSymbol;
      let launchImageUrl = imageUrl;
      let launchWebsiteUrl = normalizedWebsiteUrl;
      let launchTwitterUrl = normalizedTwitterUrl;
      let totalSupply = TOTAL_SUPPLY_UNITS;
      let creatorAllocation = allocationPreview.creatorAllocation;
      let reserveAllocation = allocationPreview.reserveAllocation;
      let active = true;

      try {
        const details = await aptos.view<
          [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            boolean,
          ]
        >({
          payload: {
            function: `${MOVEFORGE_V2_MODULE}::launch_details`,
            functionArguments: [metadataAddress],
          },
        });

        creator = details[0];
        launchName = details[2];
        launchSymbol = details[3];
        launchImageUrl = details[4];
        launchWebsiteUrl = details[5];
        launchTwitterUrl = details[6];
        totalSupply = BigInt(details[7]);
        creatorAllocation = BigInt(details[8]);
        reserveAllocation = BigInt(details[9]);
        active = details[10];
      } catch {
        setCreateMessage(
          "Transaction succeeded. Launch details are not readable yet from the V2 view.",
        );
      }

      setCreatedLaunch({
        name: launchName,
        symbol: launchSymbol,
        metadataAddress,
        transactionHash: committed.hash,
        creator,
        totalSupply: formatTokenUnits(totalSupply),
        creatorAllocation: formatTokenUnits(creatorAllocation),
        reserveAllocation: formatTokenUnits(reserveAllocation),
        creatorAllocationBps,
        imageUrl: launchImageUrl,
        websiteUrl: launchWebsiteUrl,
        twitterUrl: launchTwitterUrl,
        active,
      });
      setCreateState("success");
      setCreateMessage("Launch created successfully on Aptos testnet.");

      const committedTimestampMs =
        "timestamp_us" in committed
          ? Math.round(Number(committed.timestamp_us) / 1000)
          : 0;
      const storedLaunch: StoredLaunch = {
        metadataAddress,
        transactionHash: committed.hash,
        creatorAllocationBps,
        createdAt: committedTimestampMs,
      };
      saveStoredLaunch(storedLaunch);
      void refreshLaunches();
    } catch (error) {
      setCreateState("failure");
      setCreateMessage(
        error instanceof Error
          ? error.message
          : "Launch creation failed before it could be confirmed.",
      );
    }
  };

  return (

    <main className="min-h-screen bg-white text-[#222923]">

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[224px] flex-col border-r border-[#ECEEEA] bg-white px-4 py-5 md:flex">

        <Link href="/" className="mb-9 flex items-center gap-2.5 px-2">

          <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#B7F18A] text-lg font-black text-[#19351F]">

            M

          </div>

          <span className="text-[20px] font-bold tracking-[-0.8px]">

            MoveForge

          </span>

        </Link>

        <button

          onClick={() => {

            setActiveNav("Search");

            document.getElementById("launch-search")?.focus();

          }}

          className={`mb-5 flex h-10 items-center gap-2.5 rounded-lg border px-3 text-sm ${

            activeNav === "Search"

              ? "border-[#C8E6B5] bg-[#F4FAF0]"

              : "border-[#E9ECE7] text-[#777F77]"

          }`}

        >

          <Icon name="search" size={17} />

          <span className="flex-1 text-left">Search</span>

          <span className="text-[10px] text-[#A0A69F]">/</span>

        </button>

        <button

          onClick={() => setActiveNav("Create a Token")}

          className="mb-7 flex h-10 items-center justify-center gap-2 rounded-lg bg-[#B7F18A] px-3 text-sm font-semibold text-[#1B321F] transition hover:bg-[#A7E778]"

        >

          <Icon name="plus" size={17} />

          Create a Token

        </button>

        <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[1.4px] text-[#A0A69F]">

          Menu

        </div>

        <nav className="flex flex-col gap-1">

          {navigation.slice(2).map((item) => (

            <button

              key={item.label}

              onClick={() => setActiveNav(item.label)}

              className={`flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] transition ${

                activeNav === item.label

                  ? "bg-[#F0F5EC] font-semibold text-[#315A32]"

                  : "text-[#646D64] hover:bg-[#F7F8F5]"

              }`}

            >

              <Icon name={item.icon} size={17} />

              {item.label}

              {item.label === "Notifications" && (

                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#8CCB66]" />

              )}

            </button>

          ))}

        </nav>

        <div className="mt-auto">

          <div className="mb-2 border-t border-[#ECEEEA]" />

          <button

            onClick={() => setShowThemeMenu(!showThemeMenu)}

            className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[13px] text-[#646D64] hover:bg-[#F7F8F5]"

          >

            <Icon name="settings" size={17} />

            Theme

            <span className="ml-auto text-xs text-[#A0A69F]">

              {showThemeMenu ? "−" : "+"}

            </span>

          </button>

          {showThemeMenu && (

            <div className="mb-3 rounded-lg border border-[#ECEEEA] p-2">

              <button

                onClick={() => setShowThemeMenu(false)}

                className="w-full rounded-md bg-[#F0F5EC] px-3 py-2 text-left text-xs text-[#315A32]"

              >

                Light theme · Current

              </button>

              <p className="px-3 pt-2 text-[10px] leading-4 text-[#929990]">

                Additional themes are not enabled yet.

              </p>

            </div>

          )}

          <div className="mt-2 rounded-xl bg-[#F7F8F5] p-3">

            <div className="flex items-center gap-2">

              <span className="h-2 w-2 rounded-full bg-[#78B95B]" />

              <span className="text-xs font-semibold">Aptos Testnet</span>

            </div>

            <p className="mt-2 text-[10px] leading-4 text-[#858D83]">

              Early access environment

            </p>

          </div>

        </div>

      </aside>

      <div className="md:pl-[224px]">

        <header className="sticky top-0 z-20 flex h-[65px] items-center justify-between gap-4 border-b border-[#ECEEEA] bg-white/95 px-4 backdrop-blur sm:px-7">

          <div className="flex min-w-0 flex-1 items-center gap-3">

            <span className="hidden text-xs text-[#969D95] sm:block">

              Launchpad

            </span>

            <div className="relative w-full max-w-[340px]">

              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8D958B]">

                <Icon name="search" size={16} />

              </span>

              <input

                id="launch-search"

                value={search}

                onChange={(event) => setSearch(event.target.value)}

                placeholder="Search tokens..."

                className="h-9 w-full rounded-lg bg-[#F6F7F4] pl-9 pr-3 text-xs outline-none placeholder:text-[#9CA39A] focus:ring-1 focus:ring-[#B7DCA0]"

              />

            </div>

          </div>

          <div className="flex shrink-0 items-center gap-2">

            <span className="hidden rounded-md border border-[#E7EBE3] px-2.5 py-1.5 text-[10px] text-[#687368] sm:block">

              TESTNET

            </span>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setWalletError("");
                  setShowWalletMenu((open) => !open);
                }}
                className="flex h-9 items-center gap-2 rounded-lg border border-[#DDE4D8] px-3 text-xs font-semibold transition hover:bg-[#F5F8F2] sm:px-4"
              >
                {connected && <span className="h-2 w-2 rounded-full bg-[#78B95B]" />}
                {connected ? shortAddress : "Connect Wallet"}
              </button>

              {showWalletMenu && (
                <div className="absolute right-0 top-11 z-50 w-72 rounded-xl border border-[#E7EBE3] bg-white p-3 shadow-xl">
                  {connected ? (
                    <>
                      <p className="text-xs font-semibold">Wallet connected</p>
                      <p className="mt-2 break-all text-xs text-[#687368]">{walletAddress}</p>
                      <button
                        type="button"
                        disabled={walletBusy}
                        onClick={async () => {
                          setWalletBusy(true);
                          setWalletError("");
                          try {
                            await disconnect();
                            setShowWalletMenu(false);
                          } catch (error) {
                            setWalletError(error instanceof Error ? error.message : "Unable to disconnect wallet.");
                          } finally {
                            setWalletBusy(false);
                          }
                        }}
                        className="mt-3 h-9 w-full rounded-lg border border-[#E7EBE3] text-xs font-semibold hover:bg-[#F5F8F2] disabled:opacity-50"
                      >
                        {walletBusy ? "Please wait..." : "Disconnect wallet"}
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="px-1 pb-2 text-xs font-semibold">Connect an Aptos wallet</p>
                      {wallets.map(({ name, icon, readyState }) => (
                        <button
                          type="button"
                          key={name}
                          disabled={walletBusy || readyState !== "Installed"}
                          onClick={async () => {
                            setWalletBusy(true);
                            setWalletError("");
                            try {
                              await connect(name);
                              setShowWalletMenu(false);
                            } catch (error) {
                              setWalletError(error instanceof Error ? error.message : "Wallet connection failed.");
                            } finally {
                              setWalletBusy(false);
                            }
                          }}
                          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-xs transition hover:bg-[#F5F8F2] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <img src={icon} alt="" className="h-7 w-7 rounded-md" />
                          <span className="flex-1 font-medium">{name}</span>
                          <span className="text-[10px] text-[#858D83]">
                            {readyState === "Installed" ? "Detected" : "Not installed"}
                          </span>
                        </button>
                      ))}
                      {wallets.length === 0 && (
                        <p className="px-1 py-3 text-xs text-[#858D83]">No compatible Aptos wallets detected.</p>
                      )}
                    </>
                  )}
                  {walletError && <p role="alert" className="mt-3 break-words text-xs text-red-600">{walletError}</p>}
                </div>
              )}
            </div>

          </div>

        </header>

        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-7 sm:py-8">

          {activeNav === "Create a Token" ? (

            <section className="mx-auto max-w-5xl py-8">

              <button

                onClick={() => setActiveNav("Launches")}

                className="mb-6 text-xs text-[#747D73] hover:text-[#315A32]"

              >

                ← Back to launches

              </button>

              <h1 className="text-2xl font-bold tracking-tight">

                Create a V2 Launch

              </h1>

              <p className="mt-2 text-sm leading-6 text-[#7F877E]">

                Mint a fixed-supply MoveForge token on Aptos testnet and place
                the launch reserve in V2 custody. Buy, sell, fees, and
                graduation are labeled below as coming soon.

              </p>

              <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-5 rounded-xl border border-[#E7EBE3] p-5 sm:p-7">

                  <label className="block text-xs font-semibold">

                    Token name

                    <input

                      value={tokenName}
                      onChange={(event) => setTokenName(event.target.value)}
                      placeholder="Enter token name"

                      className="mt-2 h-11 w-full rounded-lg border border-[#E5E9E1] px-3 text-sm font-normal outline-none focus:border-[#8BCB6C]"

                    />

                  </label>

                  <label className="block text-xs font-semibold">

                    Token ticker

                    <input

                      value={tokenSymbol}
                      onChange={(event) =>
                        setTokenSymbol(event.target.value.toUpperCase())
                      }
                      placeholder="e.g. MOVE"

                      maxLength={10}

                      className="mt-2 h-11 w-full rounded-lg border border-[#E5E9E1] px-3 text-sm font-normal uppercase outline-none focus:border-[#8BCB6C]"

                    />

                  </label>

                  <label className="block text-xs font-semibold">

                    Token image

                    <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#E5E9E1] bg-[#F7F8F5] text-[10px] text-[#858D83]">
                        {imagePreviewUrl ? (
                          <img
                            src={imagePreviewUrl}
                            alt="Token image preview"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          "No image"
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            const validationError = file
                              ? validateImageFile(file)
                              : "";
                            setImageFile(file);
                            setUploadedImageUrl("");
                            setUploadProgress(0);
                            setUploadMessage("");
                            setImageError(validationError);
                          }}
                          className="block w-full text-xs text-[#687368] file:mr-3 file:h-9 file:rounded-lg file:border-0 file:bg-[#F0F5EC] file:px-3 file:text-xs file:font-semibold file:text-[#315A32]"
                        />
                        <p className="mt-2 text-[11px] leading-5 text-[#858D83]">
                          Optional PNG, JPG, WebP, or GIF. Maximum size is 2 MB.
                        </p>
                        {imageError && (
                          <p className="mt-2 text-[11px] leading-5 text-[#A44747]">
                            {imageError}
                          </p>
                        )}
                      </div>
                    </div>

                  </label>

                  <label className="block text-xs font-semibold">

                    Website URL

                    <input

                      value={websiteUrl}
                      onChange={(event) => setWebsiteUrl(event.target.value)}
                      placeholder="https://example.com"

                      className={`mt-2 h-11 w-full rounded-lg border px-3 text-sm font-normal outline-none focus:border-[#8BCB6C] ${
                        isValidOptionalUrl(normalizedWebsiteUrl)
                          ? "border-[#E5E9E1]"
                          : "border-[#D97777]"
                      }`}

                    />

                  </label>

                  <label className="block text-xs font-semibold">

                    X/Twitter profile URL

                    <input

                      value={twitterUrl}
                      onChange={(event) => setTwitterUrl(event.target.value)}
                      placeholder="https://x.com/moveforge"

                      className={`mt-2 h-11 w-full rounded-lg border px-3 text-sm font-normal outline-none focus:border-[#8BCB6C] ${
                        isValidOptionalUrl(normalizedTwitterUrl)
                          ? "border-[#E5E9E1]"
                          : "border-[#D97777]"
                      }`}

                    />

                  </label>

                  <label className="block text-xs font-semibold">

                    Creator allocation

                    <div className="mt-2 flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={MAX_CREATOR_ALLOCATION_BPS}
                        value={creatorAllocationBps}
                        onChange={(event) =>
                          setCreatorAllocationBps(Number(event.target.value))
                        }
                        className="h-2 flex-1 accent-[#7EC75A]"
                      />
                      <input
                        type="number"
                        min={0}
                        max={MAX_CREATOR_ALLOCATION_BPS}
                        value={creatorAllocationBps / 100}
                        step={0.01}
                        onChange={(event) => {
                          const nextValue = Math.round(
                            Number(event.target.value) * 100,
                          );
                          setCreatorAllocationBps(
                            Number.isFinite(nextValue)
                              ? Math.min(
                                  MAX_CREATOR_ALLOCATION_BPS,
                                  Math.max(0, nextValue),
                                )
                              : 0,
                          );
                        }}
                        className="h-11 w-24 rounded-lg border border-[#E5E9E1] px-3 text-sm font-normal outline-none focus:border-[#8BCB6C]"
                      />
                      <span className="text-sm text-[#687368]">%</span>
                    </div>

                    <p className="mt-2 text-[11px] leading-5 text-[#858D83]">
                      Maximum creator allocation is 1.3% and is included in
                      the 1,000,000,000 token supply.
                    </p>

                  </label>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-[#F5F8F1] p-3">
                      <div className="text-[10px] uppercase tracking-[1px] text-[#858D83]">
                        Supply
                      </div>
                      <div className="mt-1 text-sm font-bold">
                        1,000,000,000
                      </div>
                      <div className="mt-1 text-[11px] text-[#858D83]">
                        8 decimals
                      </div>
                    </div>
                    <div className="rounded-lg bg-[#F5F8F1] p-3">
                      <div className="text-[10px] uppercase tracking-[1px] text-[#858D83]">
                        Creator
                      </div>
                      <div className="mt-1 text-sm font-bold">
                        {formatTokenUnits(allocationPreview.creatorAllocation)}
                      </div>
                      <div className="mt-1 text-[11px] text-[#858D83]">
                        {(creatorAllocationBps / 100).toFixed(2)}%
                      </div>
                    </div>
                    <div className="rounded-lg bg-[#F5F8F1] p-3">
                      <div className="text-[10px] uppercase tracking-[1px] text-[#858D83]">
                        Launch reserve
                      </div>
                      <div className="mt-1 text-sm font-bold">
                        {formatTokenUnits(allocationPreview.reserveAllocation)}
                      </div>
                      <div className="mt-1 text-[11px] text-[#858D83]">
                        V2 custody
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2 rounded-lg border border-[#E8EBE5] p-3 text-xs leading-5 text-[#65755D] sm:grid-cols-3">
                    <div>
                      <span className="font-semibold text-[#424B41]">
                        Buy and sell:
                      </span>{" "}
                      coming soon.
                    </div>
                    <div>
                      <span className="font-semibold text-[#424B41]">
                        Fees:
                      </span>{" "}
                      coming soon.
                    </div>
                    <div>
                      <span className="font-semibold text-[#424B41]">
                        Graduation:
                      </span>{" "}
                      coming soon.
                    </div>
                  </div>

                  {createState !== "idle" && (
                    <div
                      role="status"
                      className={`rounded-lg border p-3 text-xs leading-5 ${
                        createState === "success"
                          ? "border-[#BFE3B7] bg-[#F2FAEF] text-[#315A32]"
                          : createState === "failure"
                            ? "border-[#F0C8C8] bg-[#FFF6F6] text-[#A44747]"
                            : "border-[#DCE8F5] bg-[#F6FAFF] text-[#3C648E]"
                      }`}
                    >
                      <div className="font-semibold">
                        {createState === "pending"
                          ? "Transaction pending"
                          : createState === "success"
                            ? "Launch created"
                            : "Launch creation failed"}
                      </div>
                      <div className="mt-1 break-words">{createMessage}</div>
                    </div>
                  )}

                  {uploadMessage && (
                    <div className="rounded-lg border border-[#DCE8F5] bg-[#F6FAFF] p-3 text-xs leading-5 text-[#3C648E]">
                      <div>{uploadMessage}</div>
                      {createState === "pending" && uploadProgress > 0 && (
                        <div className="mt-2">
                          <div className="flex justify-between text-[10px]">
                            <span>Upload progress</span>
                            <span>{uploadProgress}%</span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#D7E6F7]">
                            <div
                              className="h-full rounded-full bg-[#5F93C8]"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!isWalletOnMoveForgeNetwork && connected && (
                    <div className="rounded-lg border border-[#F0C8C8] bg-[#FFF6F6] p-3 text-xs leading-5 text-[#A44747]">
                      Wallet network is {formatWalletNetworkName(walletNetworkName)}.
                      MoveForge V2 is configured for {MOVEFORGE_NETWORK_LABEL};
                      switch networks in your wallet before creating a launch.
                    </div>
                  )}

                  <button

                    type="button"
                    disabled={!canCreate}
                    onClick={createLaunch}
                    className="h-11 w-full rounded-lg bg-[#B7F18A] text-sm font-semibold text-[#1B321F] transition hover:bg-[#A7E778] disabled:cursor-not-allowed disabled:bg-[#E6EDE0] disabled:text-[#7C8974]"

                  >

                    {createState === "pending"
                      ? "Creating launch..."
                      : connected
                        ? "Create V2 launch"
                        : "Connect wallet to create"}

                  </button>

                </div>

                <aside className="space-y-4">
                  <div className="rounded-xl border border-[#E7EBE3] p-5">
                    <h2 className="text-sm font-bold">Token metadata</h2>
                    {imagePreviewUrl && (
                      <img
                        src={imagePreviewUrl}
                        alt="Token image preview"
                        className="mt-4 aspect-square w-full rounded-lg object-cover"
                      />
                    )}
                    <dl className="mt-4 space-y-3 text-xs">
                      <div className="flex justify-between gap-4">
                        <dt className="text-[#858D83]">Name</dt>
                        <dd className="text-right font-semibold">
                          {normalizedName || "Not set"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-[#858D83]">Ticker</dt>
                        <dd className="text-right font-semibold">
                          {normalizedSymbol || "Not set"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-[#858D83]">Network</dt>
                        <dd className="text-right font-semibold">
                          {MOVEFORGE_NETWORK_LABEL}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-[#858D83]">Fullnode</dt>
                        <dd className="max-w-[190px] truncate text-right font-semibold">
                          {MOVEFORGE_FULLNODE}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-[#858D83]">Wallet network</dt>
                        <dd className="text-right font-semibold">
                          {formatWalletNetworkName(walletNetworkName)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[#858D83]">Website</dt>
                        <dd className="mt-1 break-all font-semibold">
                          {normalizedWebsiteUrl || "Not set"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[#858D83]">X/Twitter</dt>
                        <dd className="mt-1 break-all font-semibold">
                          {normalizedTwitterUrl || "Not set"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-[#858D83]">Module</dt>
                        <dd className="max-w-[190px] truncate text-right font-semibold">
                          {MOVEFORGE_ADDRESS}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {createdLaunch && (
                    <div className="rounded-xl border border-[#CFE8C7] bg-[#FAFEF8] p-5">
                      <h2 className="text-sm font-bold">Created launch</h2>
                      {createdLaunch.imageUrl && (
                        <img
                          src={createdLaunch.imageUrl}
                          alt={`${createdLaunch.name} token image`}
                          className="mt-4 aspect-square w-full rounded-lg object-cover"
                        />
                      )}
                      <dl className="mt-4 space-y-3 text-xs">
                        <div className="flex justify-between gap-4">
                          <dt className="text-[#858D83]">Token</dt>
                          <dd className="text-right font-semibold">
                            {createdLaunch.name} ({createdLaunch.symbol})
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[#858D83]">Metadata object</dt>
                          <dd className="mt-1 flex items-start gap-1.5">
                            <a
                              href={explorerObjectUrl(
                                createdLaunch.metadataAddress,
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-w-0 break-all font-semibold text-[#497D37] hover:text-[#315A32]"
                            >
                              {createdLaunch.metadataAddress} ↗
                            </a>
                            <CopyButton value={createdLaunch.metadataAddress} />
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[#858D83]">Transaction</dt>
                          <dd className="mt-1 break-all font-semibold">
                            <a
                              href={explorerTxUrl(createdLaunch.transactionHash)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#497D37] hover:text-[#315A32]"
                            >
                              {createdLaunch.transactionHash} ↗
                            </a>
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-[#858D83]">Total supply</dt>
                          <dd className="text-right font-semibold">
                            {createdLaunch.totalSupply}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-[#858D83]">Creator allocation</dt>
                          <dd className="text-right font-semibold">
                            {createdLaunch.creatorAllocation} (
                            {(createdLaunch.creatorAllocationBps / 100).toFixed(
                              2,
                            )}
                            %)
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-[#858D83]">Reserve allocation</dt>
                          <dd className="text-right font-semibold">
                            {createdLaunch.reserveAllocation}
                          </dd>
                        </div>
                        {createdLaunch.websiteUrl && (
                          <div>
                            <dt className="text-[#858D83]">Website</dt>
                            <dd className="mt-1 break-all font-semibold">
                              <a
                                href={createdLaunch.websiteUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#497D37] hover:text-[#315A32]"
                              >
                                {createdLaunch.websiteUrl}
                              </a>
                            </dd>
                          </div>
                        )}
                        {createdLaunch.twitterUrl && (
                          <div>
                            <dt className="text-[#858D83]">X/Twitter</dt>
                            <dd className="mt-1 break-all font-semibold">
                              <a
                                href={createdLaunch.twitterUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#497D37] hover:text-[#315A32]"
                              >
                                {createdLaunch.twitterUrl}
                              </a>
                            </dd>
                          </div>
                        )}
                        <div className="flex justify-between gap-4">
                          <dt className="text-[#858D83]">Status</dt>
                          <dd className="text-right font-semibold">
                            {createdLaunch.active ? "Active" : "Inactive"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  )}
                </aside>

              </div>

            </section>

          ) : (

            <>

              <section className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

                <div>

                  <div className="mb-2 text-[11px] font-medium text-[#858D83]">

                    HOME / LAUNCHES

                  </div>

                  <h1 className="text-[26px] font-bold tracking-[-1px] sm:text-[30px]">

                    Launches

                  </h1>

                  <p className="mt-1.5 text-xs leading-5 text-[#858D83]">

                    Launches created from this browser, read back from the
                    MoveForge V2 module on Aptos Testnet. Discovery across all
                    wallets arrives with on-chain launch events.

                  </p>

                </div>

                <button

                  onClick={() => setActiveNav("Create a Token")}

                  className="flex h-10 items-center justify-center gap-2 self-start rounded-lg bg-[#B7F18A] px-4 text-xs font-semibold text-[#20391F] transition hover:bg-[#A7E778] sm:self-auto"

                >

                  <Icon name="plus" size={15} />

                  Launch a token

                </button>

              </section>

              <section>

                <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">

                  <div>

                    <h2 className="text-[15px] font-bold">Your launches</h2>

                    <p className="mt-1 text-[11px] text-[#929990]">

                      Trading, fees, and graduation are not live yet.

                    </p>

                  </div>

                  <div className="flex items-center gap-3">

                    {launchRefresh === "error" && (

                      <span className="text-[11px] text-[#A44747]">

                        Some launch details could not be read from Testnet.

                      </span>

                    )}

                    <button

                      type="button"

                      disabled={launchRefresh === "loading"}

                      onClick={() => void refreshLaunches()}

                      className="h-8 rounded-lg border border-[#E6EAE3] px-3 text-[11px] font-semibold text-[#424B41] transition hover:bg-[#F5F7F2] disabled:opacity-50"

                    >

                      {launchRefresh === "loading" ? "Refreshing..." : "Refresh"}

                    </button>

                  </div>

                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">

                  {visibleLaunchRecords.map((record) => (

                    <article

                      key={record.metadataAddress}

                      className="overflow-hidden rounded-xl border border-[#E8EBE5] bg-white"

                    >

                      <div className="flex items-center gap-3 border-b border-[#F0F1EE] p-4">

                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#E5E9E1] bg-[#F7F8F5] text-xs font-bold text-[#303B32]">

                          {record.imageUrl ? (

                            <img

                              src={record.imageUrl}

                              alt={`${record.name} token image`}

                              className="h-full w-full object-cover"

                            />

                          ) : (

                            record.symbol.slice(0, 2) || "?"

                          )}

                        </div>

                        <div className="min-w-0 flex-1">

                          <h3 className="truncate text-sm font-bold">

                            {record.name}

                          </h3>

                          <div className="mt-0.5 text-[11px] text-[#858D83]">

                            {record.symbol}

                          </div>

                        </div>

                        <span

                          className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium ${

                            record.detailsUnavailable

                              ? "bg-[#FFF4DD] text-[#946B1D]"

                              : record.active

                                ? "bg-[#EDF7ED] text-[#367849]"

                                : "bg-[#F5F5F5] text-[#777F77]"

                          }`}

                        >

                          {record.detailsUnavailable

                            ? "Unreadable"

                            : record.active

                              ? "Active"

                              : "Inactive"}

                        </span>

                      </div>

                      <dl className="space-y-2 p-4 text-xs">

                        <div className="flex items-center justify-between gap-4">

                          <dt className="text-[#858D83]">Creator</dt>

                          <dd className="flex items-center gap-1.5">

                            {record.creator ? (

                              <>

                                <a

                                  href={explorerAccountUrl(record.creator)}

                                  target="_blank"

                                  rel="noopener noreferrer"

                                  className="font-mono text-[11px] text-[#497D37] hover:text-[#315A32]"

                                  title={record.creator}

                                >

                                  {shortHex(record.creator)}

                                </a>

                                <CopyButton value={record.creator} />

                              </>

                            ) : (

                              <span className="font-mono text-[11px]">

                                Unknown

                              </span>

                            )}

                          </dd>

                        </div>

                        <div>

                          <dt className="text-[#858D83]">Token address</dt>

                          <dd className="mt-1 flex items-start gap-1.5">

                            <span className="min-w-0 break-all font-mono text-[10px] leading-4">

                              {record.metadataAddress}

                            </span>

                            <CopyButton value={record.metadataAddress} />

                          </dd>

                        </div>

                        <div className="flex justify-between gap-4">

                          <dt className="text-[#858D83]">Total supply</dt>

                          <dd className="text-right font-semibold tabular-nums">

                            {record.totalSupply || "—"}

                          </dd>

                        </div>

                        <div className="flex justify-between gap-4">

                          <dt className="text-[#858D83]">Creator allocation</dt>

                          <dd className="text-right font-semibold tabular-nums">

                            {record.creatorAllocation || "—"}

                          </dd>

                        </div>

                        <div className="flex justify-between gap-4">

                          <dt className="text-[#858D83]">Curve reserve</dt>

                          <dd className="text-right font-semibold tabular-nums">

                            {record.reserveAllocation || "—"}

                          </dd>

                        </div>

                        <div className="flex justify-between gap-4">

                          <dt className="text-[#858D83]">Created</dt>

                          <dd className="text-right text-[11px]">

                            {record.createdAt
                              ? new Date(record.createdAt).toLocaleString()
                              : "Unknown"}

                          </dd>

                        </div>

                        {record.detailsUnavailable && (

                          <p className="rounded-md bg-[#FFF6F6] p-2 text-[11px] leading-4 text-[#A44747]">

                            On-chain details could not be read for this launch.
                            It may have been created by a different wallet or
                            the metadata address is wrong. Use refresh or check
                            the transaction on the explorer.

                          </p>

                        )}

                      </dl>

                      <div className="flex flex-wrap items-center gap-3 border-t border-[#F0F1EE] px-4 py-3 text-[11px]">

                        <a

                          href={explorerTxUrl(record.transactionHash)}

                          target="_blank"

                          rel="noreferrer"

                          className="font-semibold text-[#497D37] hover:text-[#315A32]"

                        >

                          Transaction ↗

                        </a>

                        <a

                          href={explorerObjectUrl(record.metadataAddress)}

                          target="_blank"

                          rel="noreferrer"

                          className="font-semibold text-[#497D37] hover:text-[#315A32]"

                        >

                          Token object ↗

                        </a>

                      </div>

                    </article>

                  ))}

                </div>

                {launchRecords.length === 0 && !launchRefreshLoading && (

                  <div className="rounded-xl border border-[#E8EBE5] bg-white px-4 py-12 text-center">

                    <p className="text-sm font-semibold">No launches yet</p>

                    <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#858D83]">

                      Launches you create in this browser appear here, verified
                      against the MoveForge V2 module on Aptos Testnet. Trading
                      is not available yet — creating a token places its
                      reserve in V2 custody.

                    </p>

                    <button

                      type="button"

                      onClick={() => setActiveNav("Create a Token")}

                      className="mt-4 h-10 rounded-lg bg-[#B7F18A] px-4 text-xs font-semibold text-[#20391F] transition hover:bg-[#A7E778]"

                    >

                      Create your first token

                    </button>

                  </div>

                )}

                {launchRecords.length > 0 && visibleLaunchRecords.length === 0 && (

                  <div className="rounded-xl border border-[#E8EBE5] bg-white px-4 py-12 text-center text-xs text-[#858D83]">

                    No launches match your search.

                  </div>

                )}

              </section>

            </>

          )}

          <footer className="mt-10 flex flex-col justify-between gap-2 border-t border-[#ECEEEA] py-5 text-[10px] text-[#929990] sm:flex-row">

            <span>MoveForge · Aptos-native launchpad</span>

            <span>Testnet prototype · On-chain integration pending</span>

          </footer>

        </div>

      </div>

    </main>

  );

}
