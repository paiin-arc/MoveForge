

"use client";

import { useMemo, useRef, useState } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";

type Launch = {

  name: string;

  ticker: string;

  initials: string;

  image: string;

  color: string;

  marketCap: string;

  price: string;

  change: number;

  progress: number;

  status: "New" | "Active" | "Near Graduation" | "Graduated";

  chart: number[];

};

const launches: Launch[] = [

  {

    name: "Aptos Labs",

    ticker: "APTL",

    initials: "A",

    image: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=AptosLabs&backgroundColor=dde9d5",

    color: "#DDE9D5",

    marketCap: "$48.2K",

    price: "$0.00482",

    change: 24.8,

    progress: 86,

    status: "Near Graduation",

    chart: [5, 8, 6, 12, 9, 14, 12, 19, 15, 24, 20, 29, 25, 36],

  },

  {

    name: "Move Culture",

    ticker: "CULT",

    initials: "MC",

    image: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=MoveCulture&backgroundColor=e4e5f8",

    color: "#E4E5F8",

    marketCap: "$31.6K",

    price: "$0.00316",

    change: 12.4,

    progress: 64,

    status: "Active",

    chart: [5, 7, 6, 10, 8, 14, 11, 15, 14, 20, 17, 23, 21, 27],

  },

  {

    name: "Forge Finance",

    ticker: "FORGE",

    initials: "F",

    image: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=ForgeFinance&backgroundColor=f4e5cb",

    color: "#F4E5CB",

    marketCap: "$19.8K",

    price: "$0.00198",

    change: 8.6,

    progress: 43,

    status: "Active",

    chart: [18, 14, 17, 12, 15, 19, 17, 22, 18, 25, 22, 28, 25, 31],

  },

  {

    name: "Aptos Pixel",

    ticker: "PIXEL",

    initials: "P",

    image: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=AptosPixel&backgroundColor=d5eae8",

    color: "#D5EAE8",

    marketCap: "$12.4K",

    price: "$0.00124",

    change: -3.2,

    progress: 24,

    status: "New",

    chart: [26, 23, 27, 20, 24, 18, 21, 16, 20, 14, 17, 12, 15, 10],

  },

  {

    name: "Green Candle",

    ticker: "GREEN",

    initials: "G",

    image: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=GreenCandle&backgroundColor=ddebd7",

    color: "#DDEBD7",

    marketCap: "$8.7K",

    price: "$0.00087",

    change: 5.1,

    progress: 12,

    status: "New",

    chart: [5, 8, 6, 10, 8, 12, 10, 13, 11, 15, 13, 18, 16, 20],

  },

];

const filters = [

  "All",

  "New",

  "Active",

  "Near Graduation",

  "Graduated",

] as const;

type Filter = (typeof filters)[number];

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

    default:

      return null;

  }

}

function MiniChart({

  values,

  negative = false,

}: {

  values: number[];

  negative?: boolean;

}) {

  const points = values

    .map((value, index) => {

      const x = (index / (values.length - 1)) * 100;

      const y = 38 - value;

      return `${x},${y}`;

    })

    .join(" ");

  return (

    <svg

      viewBox="0 0 100 42"

      preserveAspectRatio="none"

      className="h-9 w-[100px]"

      aria-label="Illustrative price chart"

      role="img"

    >

      <polyline

        points={points}

        fill="none"

        stroke={negative ? "#D97777" : "#4B9B64"}

        strokeWidth="2"

        strokeLinecap="round"

        strokeLinejoin="round"

        vectorEffect="non-scaling-stroke"

      />

    </svg>

  );

}

function TokenAvatar({ token }: { token: Launch }) {

  return (

    <div

      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/[0.04] text-xs font-bold text-[#303B32]"

      style={{ backgroundColor: token.color }}

    >

      {token.initials}

    </div>

  );

}

function StatusBadge({ status }: { status: Launch["status"] }) {

  const classes: Record<Launch["status"], string> = {

    New: "bg-blue-50 text-blue-700",

    Active: "bg-[#EDF7ED] text-[#367849]",

    "Near Graduation": "bg-[#FFF4DD] text-[#946B1D]",

    Graduated: "bg-[#F0EBFF] text-[#7252B8]",

  };

  return (

    <span

      className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium ${classes[status]}`}

    >

      {status}

    </span>

  );

}

export default function Home() {

  const [activeFilter, setActiveFilter] = useState<Filter>("All");

  const [search, setSearch] = useState("");

  const [activeNav, setActiveNav] = useState("Launches");

  const [sortBy, setSortBy] = useState("Market Cap");

  const featuredRef = useRef<HTMLDivElement>(null);

  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const { connect, disconnect, account, connected, wallets } = useWallet();
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [walletBusy, setWalletBusy] = useState(false);

  const walletAddress = account?.address ? account.address.toString() : "";
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : "";

  const filteredLaunches = useMemo(() => {

    const result = launches.filter((token) => {

      const matchesSearch = `${token.name} ${token.ticker}`

        .toLowerCase()

        .includes(search.toLowerCase());

      const matchesFilter =

        activeFilter === "All" || token.status === activeFilter;

      return matchesSearch && matchesFilter;

    });

    if (sortBy === "24h Change") {

      result.sort((a, b) => b.change - a.change);

    }

    return result;

  }, [activeFilter, search, sortBy]);

  const featured = launches;

  const scrollFeatured = (direction: "left" | "right") => {

    if (!featuredRef.current) return;

    const container = featuredRef.current;

    container.scrollBy({

      left: direction === "right" ? container.clientWidth * 0.85 : -container.clientWidth * 0.85,

      behavior: "smooth",

    });

  };

  return (

    <main className="min-h-screen bg-white text-[#222923]">

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[224px] flex-col border-r border-[#ECEEEA] bg-white px-4 py-5 md:flex">

        <a href="/" className="mb-9 flex items-center gap-2.5 px-2">

          <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#B7F18A] text-lg font-black text-[#19351F]">

            M

          </div>

          <span className="text-[20px] font-bold tracking-[-0.8px]">

            MoveForge

          </span>

        </a>

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

            <section className="mx-auto max-w-xl py-10">

              <button

                onClick={() => setActiveNav("Launches")}

                className="mb-6 text-xs text-[#747D73] hover:text-[#315A32]"

              >

                ← Back to launches

              </button>

              <h1 className="text-2xl font-bold tracking-tight">

                Create a Token

              </h1>

              <p className="mt-2 text-sm leading-6 text-[#7F877E]">

                Prepare your token launch on Aptos. On-chain creation will be

                enabled after the MoveForge contracts are implemented and tested.

              </p>

              <div className="mt-7 space-y-5 rounded-xl border border-[#E7EBE3] p-5 sm:p-7">

                <label className="block text-xs font-semibold">

                  Token name

                  <input

                    placeholder="Enter token name"

                    className="mt-2 h-11 w-full rounded-lg border border-[#E5E9E1] px-3 text-sm font-normal outline-none focus:border-[#8BCB6C]"

                  />

                </label>

                <label className="block text-xs font-semibold">

                  Token ticker

                  <input

                    placeholder="e.g. MOVE"

                    maxLength={10}

                    className="mt-2 h-11 w-full rounded-lg border border-[#E5E9E1] px-3 text-sm font-normal outline-none focus:border-[#8BCB6C]"

                  />

                </label>

                <label className="block text-xs font-semibold">

                  Description

                  <textarea

                    placeholder="Describe your project"

                    rows={3}

                    className="mt-2 w-full rounded-lg border border-[#E5E9E1] p-3 text-sm font-normal outline-none focus:border-[#8BCB6C]"

                  />

                </label>

                <div className="rounded-lg bg-[#F5F8F1] p-3 text-xs leading-5 text-[#65755D]">

                  Planned launch configuration: APT quote asset, linear

                  bonding curve, and Shelby-backed metadata verification.

                </div>

                <button

                  disabled

                  className="h-11 w-full cursor-not-allowed rounded-lg bg-[#E6EDE0] text-sm font-semibold text-[#7C8974]"

                >

                  Token creation coming soon

                </button>

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

                    Discover launches

                  </h1>

                  <p className="mt-1.5 text-xs leading-5 text-[#858D83]">

                    Discover tokens launching across the MoveForge ecosystem.

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

              <section className="mb-9">

                <div className="mb-4 flex items-center justify-between">

                  <div>

                    <h2 className="text-[15px] font-bold">Featured launches</h2>

                    <p className="mt-1 text-[11px] text-[#929990]">

                      Sample projects for the interface preview

                    </p>

                  </div>

                  <div className="flex gap-1.5">

                    <button

                      aria-label="Previous featured launches"

                      onClick={() => scrollFeatured("left")}

                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E6EAE3] text-[#697368] hover:bg-[#F5F7F2]"

                    >

                      ‹

                    </button>

                    <button

                      aria-label="Next featured launches"

                      onClick={() => scrollFeatured("right")}

                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E6EAE3] text-[#697368] hover:bg-[#F5F7F2]"

                    >

                      ›

                    </button>

                  </div>

                </div>

                <div

                  ref={featuredRef}

                  className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-3"

                  style={{ scrollbarWidth: "none" }}

                >

                  {featured.map((token, index) => (

                    <article

                      key={token.ticker}

                      className="w-[82%] min-w-[82%] snap-start rounded-2xl border border-[#E8EBE5] bg-white p-2 shadow-md shadow-[#172014]/[0.06] transition-all duration-300 ease-out hover:-translate-y-1 hover:border-[#C8DDBB] hover:shadow-xl hover:shadow-[#172014]/[0.12] sm:w-[48%] sm:min-w-[48%] lg:w-[calc(25%-12px)] lg:min-w-[calc(25%-12px)]"

                    >

                      <div className="mb-2 overflow-hidden rounded-xl bg-[#F6F8F3]">

                        <img

                          src={token.image}

                          alt={`${token.name} token mascot`}

                          loading="lazy"

                          className="aspect-square w-full rounded-xl object-cover transition-transform duration-300 hover:scale-[1.02]"

                        />

                      </div>

                      <div className="flex items-start gap-3">

                        <div className="min-w-0 flex-1">

                          <div className="flex flex-wrap items-center gap-2">

                            <h3 className="truncate text-sm font-bold">

                              {token.name}

                            </h3>

                            <span className="text-[10px] text-[#929990]">

                              ${token.ticker}

                            </span>

                          </div>

                          <div className="mt-1.5">

                            <StatusBadge status={token.status} />

                          </div>

                        </div>

                        <span className="text-[10px] text-[#9AA197]">

                           \#{index + 1}

                        </span>

                      </div>

                      <div className="mt-3 flex items-end justify-between gap-2">

                        <div>

                          <div className="text-[10px] text-[#929990]">

                            Market cap

                          </div>

                          <div className="mt-1 text-lg font-bold tracking-tight">

                            {token.marketCap}

                          </div>

                        </div>

                        <div className="text-right">

                          <div

                            className={`text-xs font-semibold ${

                              token.change >= 0

                                ? "text-[#39915B]"

                                : "text-[#CF6868]"

                            }`}

                          >

                            {token.change > 0 ? "+" : ""}

                            {token.change.toFixed(1)}%

                          </div>

                          <div className="mt-1 text-[10px] text-[#929990]">

                            24h change

                          </div>

                        </div>

                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-[#F0F1EE] pt-3">

                        <span className="text-[10px] text-[#929990]">

                          Curve progress

                        </span>

                        <span className="text-[10px] font-semibold">

                          {token.progress}%

                        </span>

                      </div>

                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#EEF0EB]">

                        <div

                          className="h-full rounded-full bg-[#A8E47A]"

                          style={{ width: `${token.progress}%` }}

                        />

                      </div>

                    </article>

                  ))}

                </div>

              </section>

              <section>

                <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">

                  <div>

                    <h2 className="text-[15px] font-bold">All launches</h2>

                    <p className="mt-1 text-[11px] text-[#929990]">

                      Explore tokens and track their graduation progress.

                    </p>

                  </div>

                  <label className="flex items-center gap-2 text-[11px] text-[#858D83]">

                    Sort by

                    <select

                      value={sortBy}

                      onChange={(event) => setSortBy(event.target.value)}

                      className="h-8 rounded-lg border border-[#E6EAE3] bg-white px-2.5 text-xs text-[#424B41] outline-none"

                    >

                      <option>Market Cap</option>

                      <option>24h Change</option>

                    </select>

                  </label>

                </div>

                <div className="mb-4 flex gap-1 overflow-x-auto border-b border-[#E8EBE5]">

                  {filters.map((filter) => (

                    <button

                      key={filter}

                      onClick={() => setActiveFilter(filter)}

                      className={`relative shrink-0 px-3 py-3 text-xs transition ${

                        activeFilter === filter

                          ? "font-semibold text-[#315A32]"

                          : "text-[#858D83] hover:text-[#424B41]"

                      }`}

                    >

                      {filter}

                      {activeFilter === filter && (

                        <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[#83C65D]" />

                      )}

                    </button>

                  ))}

                </div>

                <div className="overflow-hidden rounded-xl border border-[#E8EBE5] bg-white">

                  <div className="flex items-center justify-between border-b border-[#E8EBE5] px-4 py-3.5">

                    <span className="text-xs font-semibold">Token pairs</span>

                    <span className="text-[10px] text-[#929990]">

                      Preview data · Not connected to Aptos

                    </span>

                  </div>

                  <div className="overflow-x-auto">

                    <table className="w-full min-w-[720px] text-left">

                      <thead className="bg-[#FAFBF9]">

                        <tr className="text-[10px] font-medium text-[#929990]">

                          <th className="px-4 py-3.5 font-medium">Pair</th>

                          <th className="px-4 py-3.5 font-medium">Price</th>

                          <th className="px-4 py-3.5 font-medium">Last 24h</th>

                          <th className="px-4 py-3.5 font-medium">24h change</th>

                          <th className="px-4 py-3.5 font-medium">Market cap</th>

                          <th className="px-4 py-3.5 font-medium">Status</th>

                        </tr>

                      </thead>

                      <tbody className="divide-y divide-[#F0F1EE]">

                        {filteredLaunches.map((token) => (

                          <tr

                            key={token.ticker}

                            className="transition hover:bg-[#FAFCF8]"

                          >

                            <td className="px-4 py-3.5">

                              <div className="flex items-center gap-2.5">

                                <TokenAvatar token={token} />

                                <div>

                                  <div className="text-xs font-semibold">

                                    {token.name}

                                  </div>

                                  <div className="mt-1 text-[10px] text-[#929990]">

                                    {token.ticker} / APT

                                  </div>

                                </div>

                              </div>

                            </td>

                            <td className="px-4 py-3.5 text-xs font-medium tabular-nums">

                              {token.price}

                            </td>

                            <td className="px-4 py-3.5">

                              <MiniChart

                                values={token.chart}

                                negative={token.change < 0}

                              />

                            </td>

                            <td

                              className={`px-4 py-3.5 text-xs font-medium tabular-nums ${

                                token.change >= 0

                                  ? "text-[#39915B]"

                                  : "text-[#CF6868]"

                              }`}

                            >

                              {token.change > 0 ? "+" : ""}

                              {token.change.toFixed(1)}%

                            </td>

                            <td className="px-4 py-3.5 text-xs font-medium tabular-nums">

                              {token.marketCap}

                            </td>

                            <td className="px-4 py-3.5">

                              <StatusBadge status={token.status} />

                            </td>

                          </tr>

                        ))}

                        {filteredLaunches.length === 0 && (

                          <tr>

                            <td

                              colSpan={6}

                              className="px-4 py-12 text-center text-xs text-[#858D83]"

                            >

                              No launches match your search or filter.

                            </td>

                          </tr>

                        )}

                      </tbody>

                    </table>

                  </div>

                  <div className="flex items-center justify-between border-t border-[#E8EBE5] px-4 py-3">

                    <span className="text-[10px] text-[#929990]">

                      {filteredLaunches.length} sample launches

                    </span>

                    <button

                      onClick={() => {

                        setSearch("");

                        setActiveFilter("All");

                        setSortBy("Market Cap");

                      }}

                      className="text-[11px] font-medium text-[#648D43] hover:text-[#315A32]"

                    >

                      Reset filters

                    </button>

                  </div>

                </div>

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