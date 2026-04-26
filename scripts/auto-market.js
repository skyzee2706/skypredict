"use strict";
/**
 * auto-market.ts (pm-kit / GenLayer Version)
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Sky Predict â€” Auto-scheduler for hourly and daily BTC/USD prediction markets
 *
 * In this system:
 * 1. The Bot creates markets with a target strike price based on live Binance/10-CEX data.
 * 2. Markets are dispatched to the BetFactoryCOFI contract.
 * 3. Once endDate passes, the Bot simply triggers `resolve()`.
 * 4. The actual settlement price is evaluated autonomously off-chain by GenLayer Oracles.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var dotenv = require("dotenv");
var path = require("path");
dotenv.config({ path: path.join(__dirname, "../contracts/.env") });
var ethers_1 = require("ethers");
var fs = require("fs");
// â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
var RPC_URL = process.env.SEISMIC_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL || "https://gcp-1.seismictest.net/rpc";
var PRIVATE_KEY = process.env.PRIVATE_KEY || "";
var FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_BET_FACTORY_ADDRESS || process.env.FACTORY_ADDRESS);
if (!RPC_URL || !PRIVATE_KEY || !FACTORY_ADDRESS) {
    console.error("âŒ  Missing required env vars.");
    process.exit(1);
}
// â”€â”€ ABIs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
var FACTORY_ABI = [
    "function createBet(string memory title, string memory resolutionCriteria, string memory sideAName, string memory sideBName, uint256 endDate, uint8 resolutionType, bytes memory resolutionData) external returns (address)",
    "function getActiveBets() external view returns (address[])"
];
var BET_ABI = [
    "function endDate() external view returns (uint256)",
    "function status() external view returns (uint8)",
    "function resolve() external",
    "function title() external view returns (string)",
    "function creator() external view returns (address)"
];
var provider = new ethers_1.ethers.JsonRpcProvider(RPC_URL);
var signer = new ethers_1.ethers.Wallet(PRIVATE_KEY, provider);
// â”€â”€ Internal 10-CEX Fallback Engine (For Target Pricing Only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getLivePrice() {
    return __awaiter(this, void 0, void 0, function () {
        var ccxt_1, exchangeIds, results, prices, mid, e_1;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    ccxt_1 = require('ccxt');
                    exchangeIds = ['binance', 'bybit', 'mexc', 'kucoin', 'gate', 'bitget', 'htx', 'okx', 'bitmart', 'digifinex'];
                    return [4 /*yield*/, Promise.all(exchangeIds.map(function (id) { return __awaiter(_this, void 0, void 0, function () {
                            var exchange, ticker, e_2;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        _a.trys.push([0, 2, , 3]);
                                        exchange = new ccxt_1[id]({ timeout: 2500 });
                                        return [4 /*yield*/, exchange.fetchTicker('BTC/USDT')];
                                    case 1:
                                        ticker = _a.sent();
                                        return [2 /*return*/, ticker.last];
                                    case 2:
                                        e_2 = _a.sent();
                                        return [2 /*return*/, null];
                                    case 3: return [2 /*return*/];
                                }
                            });
                        }); }))];
                case 1:
                    results = _a.sent();
                    prices = results.filter(function (p) { return p !== null && p > 15000; });
                    if (prices.length === 0)
                        throw new Error("Internal sources failed");
                    prices.sort(function (a, b) { return a - b; });
                    mid = Math.floor(prices.length / 2);
                    return [2 /*return*/, prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2];
                case 2:
                    e_1 = _a.sent();
                    throw new Error("Price engine failed: " + e_1.message);
                case 3: return [2 /*return*/];
            }
        });
    });
}
// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
var formatHour = function (ts) { return "".concat(new Date(ts * 1000).getUTCHours().toString().padStart(2, "00"), ":00 UTC"); };
var formatDate = function (ts) { return new Date(ts * 1000).toISOString().split("T")[0]; };
function nextHourUTC() {
    var d = new Date();
    d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
}
function nextMidnightUTC() {
    var d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
}
// â”€â”€ Lock System â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
var LOCK_FILE = path.join(__dirname, "auto-market.lock");
function clearStaleLock() {
    try {
        if (fs.existsSync(LOCK_FILE))
            fs.unlinkSync(LOCK_FILE);
    }
    catch (e) { }
}
function acquireLock() {
    try {
        if (fs.existsSync(LOCK_FILE)) {
            var stats = fs.statSync(LOCK_FILE);
            if (Date.now() - stats.mtimeMs < 120000)
                return false;
            fs.unlinkSync(LOCK_FILE);
        }
        fs.writeFileSync(LOCK_FILE, process.pid.toString());
        return true;
    }
    catch (e) {
        return false;
    }
}
function releaseLock() {
    try {
        if (fs.existsSync(LOCK_FILE))
            fs.unlinkSync(LOCK_FILE);
    }
    catch (e) { }
}
// â”€â”€ Main Controller â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function resolveMarkets() {
    return __awaiter(this, void 0, void 0, function () {
        var balance, factory, activeBets, now, activeEndTimes, _i, activeBets_1, addr, bet, _a, endDate, status_1, titleText, titleLower, isHourly, isDaily, tsType, tx, err_1, e_3, types, _b, types_1, t, targetET, alreadyExists, p, formattedPrice, q, resolutionCriteria, abiCoder, resolutionData, tx, e_4, err_2;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (!acquireLock()) {
                        console.log("â³ Another sweep is already running, skipping...");
                        return [2 /*return*/];
                    }
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 25, 26, 27]);
                    return [4 /*yield*/, provider.getBalance(signer.address)];
                case 2:
                    balance = _c.sent();
                    console.log("\n\uD83D\uDD0D [SWEEP] Balance: ".concat(ethers_1.ethers.formatEther(balance), " ETH | ").concat(new Date().toISOString()));
                    factory = new ethers_1.ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
                    return [4 /*yield*/, factory.getActiveBets()];
                case 3:
                    activeBets = _c.sent();
                    now = Math.floor(Date.now() / 1000);
                    activeEndTimes = { H: new Set(), D: new Set() };
                    _i = 0, activeBets_1 = activeBets;
                    _c.label = 4;
                case 4:
                    if (!(_i < activeBets_1.length)) return [3 /*break*/, 16];
                    addr = activeBets_1[_i];
                    _c.label = 5;
                case 5:
                    _c.trys.push([5, 14, , 15]);
                    bet = new ethers_1.ethers.Contract(addr, BET_ABI, signer);
                    return [4 /*yield*/, Promise.all([bet.endDate(), bet.status(), bet.title()])];
                case 6:
                    _a = _c.sent(), endDate = _a[0], status_1 = _a[1], titleText = _a[2];
                    titleLower = titleText.toLowerCase();
                    isHourly = (titleLower.includes(" at ") && (titleLower.includes(":") || titleLower.includes("utc"))) || titleLower.includes("hour");
                    isDaily = titleLower.includes("midnight") || titleLower.includes("daily");
                    tsType = isHourly ? "H" : isDaily ? "D" : null;
                    if (!(Number(status_1) === 0)) return [3 /*break*/, 13];
                    if (!(now >= Number(endDate))) return [3 /*break*/, 12];
                    console.log("   \u26A1 REQUESTING ORACLE: ".concat(titleText));
                    _c.label = 7;
                case 7:
                    _c.trys.push([7, 10, , 11]);
                    return [4 /*yield*/, bet.resolve()];
                case 8:
                    tx = _c.sent();
                    return [4 /*yield*/, tx.wait()];
                case 9:
                    _c.sent();
                    console.log("      \u2705 Resolution Request Sent. GenLayer will finalize shortly.");
                    return [3 /*break*/, 11];
                case 10:
                    err_1 = _c.sent();
                    console.error("      \u274C Oracle Request Fail:", err_1.shortMessage || err_1.message);
                    return [3 /*break*/, 11];
                case 11: return [3 /*break*/, 13];
                case 12:
                    if (tsType) {
                        activeEndTimes[tsType].add(Number(endDate));
                    }
                    _c.label = 13;
                case 13: return [3 /*break*/, 15];
                case 14:
                    e_3 = _c.sent();
                    console.error("   \u274C Error processing bet ".concat(addr, ":"), e_3.shortMessage || e_3.message);
                    return [3 /*break*/, 15];
                case 15:
                    _i++;
                    return [3 /*break*/, 4];
                case 16:
                    console.log("   \uD83D\uDCCA Future Pending Markets: Hourly:".concat(activeEndTimes.H.size, ", Daily:").concat(activeEndTimes.D.size));
                    types = [
                        { id: "H", label: "Hourly", getET: nextHourUTC },
                        { id: "D", label: "Daily", getET: nextMidnightUTC }
                    ];
                    _b = 0, types_1 = types;
                    _c.label = 17;
                case 17:
                    if (!(_b < types_1.length)) return [3 /*break*/, 24];
                    t = types_1[_b];
                    targetET = t.getET();
                    alreadyExists = activeEndTimes[t.id].has(targetET);
                    if (!!alreadyExists) return [3 /*break*/, 23];
                    _c.label = 18;
                case 18:
                    _c.trys.push([18, 22, , 23]);
                    console.log("   \uD83C\uDD95 [ACTION] Creating ".concat(t.label, " Bet for ").concat(new Date(targetET * 1000).toISOString(), "..."));
                    return [4 /*yield*/, getLivePrice()];
                case 19:
                    p = _c.sent();
                    formattedPrice = (Number(p)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    q = void 0;
                    resolutionCriteria = void 0;
                    // Standardize string for pm-kit.
                    if (t.id === "H") {
                        q = "Will BTC/USD be above $".concat(formattedPrice, " at ").concat(formatHour(targetET), "?");
                        resolutionCriteria = "At exactly ".concat(formatHour(targetET), " (Unix ").concat(targetET, "), the price of Bitcoin (BTC) in USD must be strictly greater than $").concat(formattedPrice, ". Source: reliable crypto data sources.");
                    }
                    else {
                        q = "Will BTC/USD be above $".concat(formattedPrice, " by midnight ").concat(formatDate(targetET), "?");
                        resolutionCriteria = "At exactly 00:00 UTC on ".concat(formatDate(targetET), " (Unix ").concat(targetET, "), the price of Bitcoin (BTC) in USD must be strictly greater than $").concat(formattedPrice, ". Source: reliable crypto data sources.");
                    }
                    console.log("      \uD83D\uDE80 Title: ".concat(q));
                    abiCoder = ethers_1.ethers.AbiCoder.defaultAbiCoder();
                    resolutionData = abiCoder.encode(["string", "string"], ["BTC", "bitcoin"]);
                    return [4 /*yield*/, factory.createBet(q, // title
                        resolutionCriteria, // resolutionCriteria
                        "Yes", // sideAName
                        "No", // sideBName
                        targetET, // endDate
                        0, // resolutionType (CRYPTO)
                        resolutionData // bytes memory resolutionData
                        )];
                case 20:
                    tx = _c.sent();
                    console.log("      \u23F3 TX Sent: ".concat(tx.hash));
                    return [4 /*yield*/, tx.wait()];
                case 21:
                    _c.sent();
                    console.log("      \u2705 Created ".concat(t.label, " Bet Successfully"));
                    return [3 /*break*/, 23];
                case 22:
                    e_4 = _c.sent();
                    console.error("      \u274C ".concat(t.label, " Create Fail:"), e_4.shortMessage || e_4.message);
                    return [3 /*break*/, 23];
                case 23:
                    _b++;
                    return [3 /*break*/, 17];
                case 24: return [3 /*break*/, 27];
                case 25:
                    err_2 = _c.sent();
                    console.error("âŒ Sweep failure:", err_2.shortMessage || err_2.message || err_2);
                    return [3 /*break*/, 27];
                case 26:
                    releaseLock();
                    return [7 /*endfinally*/];
                case 27: return [2 /*return*/];
            }
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("ðŸš€ Sky Predict Bot Starting (GenLayer Framework)...");
                    clearStaleLock();
                    return [4 /*yield*/, resolveMarkets()];
                case 1:
                    _a.sent();
                    setInterval(resolveMarkets, 60000);
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(console.error);
