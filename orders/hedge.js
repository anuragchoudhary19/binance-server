const Binance = require("node-binance-api");
const { log } = console;
var cache = require("persistent-cache");
var orders = cache();
var binance = new Binance().options({
  APIKEY: process.env.API_KEY,
  APISECRET: process.env.SECRET_KEY,
  useServerTime: true,
  recvWindow: 60000 * 2,
  reconnect: true,
  hedgeMode: true,
  family: 4,
});
function calcQuantity(order, markPrice, balance) {
  const { quantityPrecision, minimumQuantity, minimumNotional } = order;
  let sl = Number(order?.sl);
  let risk = 2 / 100;
  let risk_amt = balance * risk;
  let sl_amt = Math.abs(markPrice - sl);
  let quantity = Number((risk_amt / sl_amt).toFixed(quantityPrecision));
  if (quantity < minimumQuantity)
    throw "Quantity is less than minimum quantity";
  let notionalValue = markPrice * quantity;
  if (notionalValue < minimumNotional)
    throw "Notional Value is less than minimum required";
  return quantity;
}
function logger(symbol, side) {
  log(
    `${side} on ${symbol} at ${new Date().toLocaleTimeString(
      { en: "IN" },
      { timeZone: "Asia/Kolkata" }
    )}`
  );
}
exports.openLongHedge = async (order) => {
  const { symbol, id } = order;
  try {
    //check for repeat order
    let lastOrder = orders.getSync(symbol);
    if (lastOrder?.id === id) throw "Repeat Order";
    //check for existing position
    let { positions, availableBalance } = await binance.futuresAccount();
    let pos = positions?.find(
      (p) =>
        p.symbol === symbol &&
        p.positionSide === "LONG" &&
        Number(p.positionAmt) !== 0
    );
    if (pos) throw "Long position already exists";
    //Place order
    let { markPrice } = await binance.futuresMarkPrice(symbol);
    order["quantity"] = calcQuantity(order, markPrice, availableBalance);
    let res = await openLongPosition(order);
    logger(symbol, "Long");
    return res;
  } catch (e) {
    console.log(e);
    return e;
  }
};
exports.openShortHedge = async (order) => {
  const { symbol, id } = order;
  try {
    //check for repeat order
    let lastOrder = orders.getSync(symbol);
    if (lastOrder?.id === id) throw "Repeat Order";
    //check for existing position
    let { positions, availableBalance } = await binance.futuresAccount();
    let pos = positions?.find(
      (p) =>
        p.symbol === symbol &&
        p.positionSide === "SHORT" &&
        Number(p.positionAmt) !== 0
    );
    if (pos) throw "Short position already exists";
    //Place order
    let { markPrice } = await binance.futuresMarkPrice(symbol);
    order["quantity"] = calcQuantity(order, markPrice, availableBalance);
    let res = await openShortPosition(order);
    logger(symbol, "Short");
    return res;
  } catch (e) {
    console.log(e);
    return e;
  }
};
const openLongPosition = async (order) => {
  try {
    let { quantity, pricePrecision, symbol } = order;
    let result = await binance.futuresMarketBuy(symbol, quantity, {
      newOrderRespType: "RESULT",
    });
    if (result.msg) throw result.msg;
    let takeProfit, stopLoss;
    let executedQty = result?.executedQty;
    if (order?.tp) {
      let tp = Array.isArray(order?.tp) ? order?.tp.slice(-1)[0] : order?.tp;
      let TP = Number(Number(tp).toFixed(pricePrecision));
      takeProfit = await setTakeProfit(symbol, executedQty, TP, "sell", "LONG");
    }
    if (order?.sl) {
      let SL = Number(Number(order?.sl).toFixed(pricePrecision));
      stopLoss = await setStopLoss(symbol, executedQty, SL, "sell", "LONG");
    }
    orders.putSync(symbol, order);
    return result;
  } catch (error) {
    throw error;
  }
};

const openShortPosition = async (order) => {
  try {
    let { quantity, symbol, pricePrecision } = order;
    console.log(order);
    let result = await binance.futuresMarketSell(symbol, quantity, {
      newOrderRespType: "RESULT",
    });
    if (result.msg) throw result.msg;
    let takeProfit, stopLoss;
    let executedQty = result?.executedQty;
    if (order?.tp) {
      let tp = Array.isArray(order?.tp) ? order?.tp.slice(-1)[0] : order?.tp;
      let TP = Number(Number(tp).toFixed(pricePrecision));
      takeProfit = await setTakeProfit(symbol, executedQty, TP, "buy", "SHORT");
    }
    if (order?.sl) {
      let SL = Number(Number(order?.sl).toFixed(pricePrecision));
      stopLoss = await setStopLoss(symbol, executedQty, SL, "buy", "SHORT");
    }
    orders.putSync(symbol, order);
    return result;
  } catch (error) {
    throw error;
  }
};
const setTakeProfit = async (symbol, quantity, price, side, positionSide) => {
  let params1 = {
    type: "TAKE_PROFIT_MARKET",
    closePosition: true,
    timeInForce: "GTE_GTC",
    workingType: "MARK_PRICE",
    placeType: "position",
    stopPrice: price,
    positionSide,
  };
  let res;
  try {
    if (side === "sell") {
      res = await binance.futuresMarketSell(symbol, quantity, params1);
    } else {
      res = await binance.futuresMarketBuy(symbol, quantity, params1);
    }
    return res;
  } catch (error) {
    log(error);
  }
};
const setStopLoss = async (symbol, quantity, price, side, positionSide) => {
  let params1 = {
    type: "STOP_MARKET",
    closePosition: true,
    timeInForce: "GTE_GTC",
    workingType: "MARK_PRICE",
    placeType: "position",
    stopPrice: price,
    positionSide,
  };
  let res;
  try {
    if (side === "sell") {
      res = await binance.futuresMarketSell(symbol, quantity, params1);
    } else {
      res = await binance.futuresMarketBuy(symbol, quantity, params1);
    }
    return res;
  } catch (error) {
    log(error);
  }
};
const setTSL = async (symbol, quantity, price, cbRate, side, positionSide) => {
  let options = {
    type: "TRAILING_STOP_MARKET",
    activationPrice: price,
    callbackRate: cbRate,
    quantity,
    timeInForce: "GTE_GTC",
    workingType: "MARK_PRICE",
    positionSide,
  };
  let res;
  if (side === "sell") {
    res = await binance.futuresMarketSell(symbol, quantity, options);
  } else {
    res = await binance.futuresMarketBuy(symbol, quantity, options);
  }
  // console.log(res);
  return res;
};
exports.updateSL = async (req, res) => {
  let { symbol, positionSide, SL } = req.body;
  try {
    let result = await binance.futuresOpenOrders(symbol);
    let slOrder = result?.find(
      (o) =>
        o.symbol === symbol &&
        o.positionSide === positionSide &&
        o.type === "STOP_MARKET"
    );
    if (slOrder) {
      let cancelledOrder = await binance.futuresCancel(symbol, {
        orderId: slOrder?.orderId,
      });
    }
    let { positions } = await binance.futuresAccount();
    let pos = positions?.find(
      (p) =>
        p.symbol === symbol &&
        p.positionSide === positionSide &&
        Number(p.positionAmt) !== 0
    );
    if (!pos) return res.send("No position exists");
    let side = positionSide === "LONG" ? "sell" : "buy";
    let newSL = await setStopLoss(
      symbol,
      Math.abs(pos?.positionAmt),
      SL,
      side,
      positionSide
    );
    console.log(newSL);
    return res.send(newSL);
  } catch (error) {
    return res.send(error);
  }
};
exports.closePosition = async (req, res) => {
  if (!req.body.symbol) throw "Symbol is missing";
  if (!req.body.positionSide) throw "Position side is missing";
  let { symbol, positionSide } = req.body;
  try {
    let { positions } = await binance.futuresAccount();
    let pos = positions?.find(
      (p) =>
        p.symbol === symbol &&
        p.positionSide === positionSide &&
        Number(p.positionAmt) !== 0
    );
    // console.log(pos);
    if (!pos) return res.send("No Position");
    let result;
    let params1 = {
      type: "MARKET",
      workingType: "MARK_PRICE",
      positionSide,
    };
    if (positionSide === "LONG") {
      result = await binance.futuresMarketSell(
        symbol,
        Number(pos.positionAmt),
        params1
      );
    } else if (positionSide === "SHORT") {
      result = await binance.futuresMarketBuy(
        symbol,
        Math.abs(Number(pos.positionAmt)),
        params1
      );
    }
    return res.send(result);
  } catch (e) {
    console.log(e);
    res.send(e);
  }
};
