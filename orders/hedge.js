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
  const { quantityPrecision, minimumQuantity } = order;
  let sl = Number(order?.sl);
  let risk = 2 / 100;
  let risk_amt = balance * risk;
  let sl_amt = Math.abs(markPrice - sl);
  let quantity = Number((risk_amt / sl_amt).toFixed(quantityPrecision));
  if (quantity < minimumQuantity)
    throw "Quantity is less than minimum quantity";
  let notionalValue = markPrice * quantity;
  if (notionalValue < 5) throw "Notional Value is less than 5 USDT";
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
    let lastOrder = orders.getSync(symbol);
    if (lastOrder?.id === id) throw "Repeat Order";
    //
    let { positions, availableBalance } = await binance.futuresAccount();
    if (!positions.length) return;
    //
    let pos = positions?.find(
      (p) => p.symbol === symbol && p.positionSide === "LONG"
    );
    if (pos && Number(pos.positionAmt) !== 0)
      throw "Long position already exists";
    //
    let { markPrice } = await binance.futuresMarkPrice(symbol);
    let quantity = calcQuantity(order, markPrice, availableBalance);
    order["quantity"] = quantity;
    // Place order
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
  // console.log(order);
  // return {res:'ok'};
  try {
    let lastOrder = orders.getSync(symbol);
    console.log(lastOrder)
    if (lastOrder === id) throw "Repeat Order";
    //
    let { positions, availableBalance } = await binance.futuresAccount();
    if (positions === undefined) return;
    //
    let pos = positions?.find(
      (position) =>
        position.symbol === symbol && position.positionSide === "SHORT"
    );
    if (pos && Number(pos.positionAmt) !== 0)
      throw "Short position already exists";
    //
    let { markPrice } = await binance.futuresMarkPrice(symbol);
    let quantity = calcQuantity(order, markPrice, availableBalance);
    order["quantity"] = quantity;
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
    log(order);
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
    log(order);
    let result = await binance.futuresMarketSell(symbol, quantity, {
      newOrderRespType: "RESULT",
    });
    if (result.msg) throw result.msg;
    // console.log(result);
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
// exports.setTrailingStopLoss = async (symbol, quantity, price, cbRate, side) => {
//   console.log(symbol, quantity, price, cbRate, side);
//   let options = {
//     type: 'TRAILING_STOP_MARKET',
//     reduceOnly: true,
//     activationPrice: price,
//     callbackRate: cbRate,
//     quantity,
//     timeInForce: 'GTE_GTC',
//     workingType: 'MARK_PRICE',
//   };
//   let res;
//   if (side === 'sell') {
//     res = await binance.futuresMarketSell(symbol, quantity, options);
//   } else {
//     res = await binance.futuresMarketBuy(symbol, quantity, options);
//   }
//   console.log(res);
//   return res;
// };
const bookProfit = async (coin) => {
  const { symbol, positionAmt } = coin;
  if (parseFloat(positionAmt) > 0) {
    console.log(
      await binance.futuresMarketSell(
        symbol,
        parseInt(positionAmt),
        { reduceOnly: true },
        { newOrderRespType: "RESULT" }
      )
    );
  }
  if (parseFloat(positionAmt) < 0) {
    console.log(
      await binance.futuresMarketBuy(
        symbol,
        Math.abs(parseInt(positionAmt)),
        { reduceOnly: true },
        { newOrderRespType: "RESULT" }
      )
    );
  }
};

const cancelAllOpenOrders = async (symbol) => {
  let result = await binance.futuresOpenOrders(symbol);
  for (let i = 0; i < result.length; i++) {
    let param = { orderId: result[i].orderId };
    await binance.futuresCancel(symbol, param);
  }
};
exports.closePosition = async (req, res) => {
  let symbol = req.params.coin;
  try {
    let { positions } = await binance.futuresAccount();
    let { positionAmt } = positions.filter(
      (position) => position.symbol === symbol
    )[0];
    if (parseInt(positionAmt) === 0) return res.send("No Position");
    let result;
    if (parseFloat(positionAmt) > 0) {
      result = await binance.futuresMarketSell(
        symbol,
        positionAmt,
        { reduceOnly: true },
        { newOrderRespType: "RESULT" }
      );
    } else {
      result = await binance.futuresMarketBuy(
        symbol,
        Math.abs(parseFloat(positionAmt)),
        { reduceOnly: true },
        { newOrderRespType: "RESULT" }
      );
    }
    return res.send(result);
  } catch (e) {
    console.log(e);
    res.send("err");
  }
};
exports.closePositions = async (symbol) => {
  try {
    let { positions } = await binance.futuresAccount();
    let { positionAmt } = positions.filter(
      (position) => position.symbol === symbol
    )[0];
    if (parseInt(positionAmt) === 0) return "No Position";
    let result;
    if (parseFloat(positionAmt) > 0) {
      result = await binance.futuresMarketSell(
        symbol,
        positionAmt,
        { reduceOnly: true },
        { newOrderRespType: "RESULT" }
      );
    } else {
      result = await binance.futuresMarketBuy(
        symbol,
        Math.abs(parseFloat(positionAmt)),
        { reduceOnly: true },
        { newOrderRespType: "RESULT" }
      );
    }
    if (result?.symbol) {
      console.log(result?.symbol + " closed");
    }
    return result;
  } catch (e) {
    console.log(e);
  }
};
