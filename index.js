require("dotenv").config();
const express = require("express");
const { createServer } = require("http");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const morgan = require("morgan");
const {
  futuresAccount,
  getFuturesBalances,
  getFuturesOpenPositons,
  getUnrealizedProfitCoins,
  getIncome,
  getPnl,
} = require("./accounts/accounts.js");
const { adjustMarginMode, adjustLeverage } = require("./orders/preferences.js");
const { openLong, openShort } = require("./orders/oneWay.js");
const {
  openLongHedge,
  openShortHedge,
  closePosition,
  updateSL,
} = require("./orders/hedge.js");
const { getExchangeInfo } = require("./functions/exchangeInfo.js");
const app = express();
app.use(express.json());
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: true }));
app.use(cors());
let pricePrecision;
let quantityPrecision;
let minimumQuantity;
let minimumNotional;
(async () => {
  try {
    let result = await getExchangeInfo();
    pricePrecision = result?.pricePrecision;
    quantityPrecision = result?.quantityPrecision;
    minimumQuantity = result?.minimumQuantity;
    minimumNotional = result?.minimumNotional;
  } catch (error) {
    console.error("Error:", error);
  }
})();
app.get("/account", futuresAccount);
app.get("/book", getUnrealizedProfitCoins);
app.post("/income", async (req, res) => {
  let result = await getIncome(req, res);
  res.send(result);
});
app.get("/pnl", getPnl);
app.get("/balance", getFuturesBalances);
app.get("/positions", getFuturesOpenPositons);
app.post("/order", async (req, res) => {
  try {
    let order = req.body;
    order["id"] = order?.id || uuidv4();
    order["symbol"] = order?.symbol.toUpperCase();
    order["pricePrecision"] = pricePrecision.get(order?.symbol);
    order["quantityPrecision"] = quantityPrecision.get(order?.symbol);
    order["minimumQuantity"] = minimumQuantity.get(order?.symbol);
    order["minimumNotional"] = minimumNotional.get(order?.symbol);
    if (!order?.side) throw "Position side is missing";
    if (!order?.sl) throw "Stoploss is missing";
    let side = order?.side.toUpperCase();
    if (side === "LONG") {
      let result = await openLongHedge(order);
      res.send(result);
    } else if (side === "SHORT") {
      let result = await openShortHedge(order);
      res.send(result);
    }
  } catch (error) {
    res.send(error);
  }
});
app.post("/close", closePosition);
app.post("/updateSL", updateSL);
app.post("/lev/:leverage", adjustLeverage);
app.post("/wallet/:mode", adjustMarginMode);
app.get("/health", (req, res) => {
  res.send({ ok: true });
});
const httpServer = createServer(app);
let PORT = process.env.PORT || 3004;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
