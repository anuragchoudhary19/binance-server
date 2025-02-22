const Binance = require("node-binance-api");
var cache = require("persistent-cache");
var orders = cache();
var binance = new Binance().options({
  APIKEY: process.env.API_KEY,
  APISECRET: process.env.SECRET_KEY,
  useServerTime: true,
  recvWindow: 60000 * 2,
  reconnect: true,
  family: 4,
});

exports.openLong = async (symbol, orderId, atr, prc, qty, sl, tp) => {
  try {
    let lastOrder = orders.getSync(symbol);
    if (lastOrder === orderId) throw "Repeat Order";
    //
    let { positions, availableBalance } = await binance.futuresAccount();
    if (positions === undefined) return;
    //
    // let longs = positions?.filter((p) => parseFloat(p.positionAmt) > 0);

    // if (longs.length > 2) throw "Max number of long positions reached";
    //
    let { positionAmt, leverage } = positions?.filter(
      (p) => p.symbol === symbol
    )[0];
    if (parseFloat(positionAmt) !== 0) {
      throw "Position already exists";
    }
    let { markPrice } = await binance.futuresMarkPrice(symbol);
    // let availableBalance = 40;
    let risk = 1.5 / 100;
    let risk_amt = availableBalance * risk;
    let sl_amt = Math.abs(markPrice - sl);
    let quantity = parseFloat((risk_amt / sl_amt).toFixed(qty));
    let notionalValue = markPrice * quantity;
    if (notionalValue < 5) throw "Notional Value is less than 5 USDT";
    if (quantity === 0) throw "Not Enough Margin";
    //
    let result = await openLongPosition(
      quantity,
      symbol,
      atr,
      prc,
      qty,
      sl,
      tp
    );
    // console.log(result);
    if (result?.symbol) {
      orders.putSync(symbol, orderId);
    }
    console.log(
      "Long on " +
        result?.symbol +
        " " +
        new Date().toLocaleTimeString({ en: "IN" })
    );
    return result;
  } catch (e) {
    console.log(e);
    return;
  }
};
exports.openShort = async (symbol, orderId, atr, prc, qty, sl, tp) => {
  try {
    let lastOrder = orders.getSync(symbol);
    if (lastOrder === orderId) throw "Repeat Order";
    //
    let { positions, availableBalance } = await binance.futuresAccount();
    if (positions === undefined) return;
    //
    // let shorts = positions?.filter((p) => parseFloat(p.positionAmt) < 0);
    // if (shorts.length > 2) throw "Max number of short positions reached";
    //
    let { positionAmt, leverage } = positions?.filter(
      (p) => p.symbol === symbol
    )[0];
    if (parseFloat(positionAmt) !== 0) {
      throw "Position already exists";
    }
    //
    let { markPrice } = await binance.futuresMarkPrice(symbol);
    // let availableBalance = 40;
    let risk = 1.5 / 100;
    let risk_amt = availableBalance * risk;
    let sl_amt = Math.abs(markPrice - sl);
    let quantity = parseFloat((risk_amt / sl_amt).toFixed(qty));
    let notionalValue = quantity * markPrice;
    if (notionalValue < 5) throw "Notional Value is less than 5 USDT";
    if (quantity === 0) throw "Not Enough Margin";
    //
    let result = await openShortPosition(
      quantity,
      symbol,
      atr,
      prc,
      qty,
      sl,
      tp
    );

    // console.log(result);
    if (result?.symbol) {
      orders.putSync(symbol, orderId);
    }
    console.log(
      "Short on " +
        result?.symbol +
        " " +
        new Date().toLocaleTimeString({ en: "IN" })
    );
    return result;
  } catch (e) {
    console.log(e);
    return;
  }
};
const openLongPosition = async (quantity, symbol, atr, prc, qty, sl, tp) => {
  try {
    let result = await binance.futuresMarketBuy(symbol, quantity, {
      newOrderRespType: "RESULT",
    });
    let takeProfit, stopLoss;
    if (result?.avgPrice !== undefined) {
      let buyPrice = parseFloat(result.avgPrice);
      let quantity = result?.executedQty;
      let tp1 = parseFloat(tp[0].toFixed(prc));
      let tp2 = parseFloat(tp[1].toFixed(prc));
      let tp3 = parseFloat(tp[2].toFixed(prc));
      let tp4 = parseFloat(tp[3].toFixed(prc));
      let SL = parseFloat(sl.toFixed(prc));
      let q1 = parseFloat((0.5 * quantity).toFixed(qty));
      let q2 = parseFloat((0.2 * quantity).toFixed(qty));
      let q3 = parseFloat((0.2 * quantity).toFixed(qty));
      let q4 = parseFloat((quantity - q1 - q2 - q3).toFixed(qty));
      // console.log(q1, q2, q3, q4);
      try {
        takeProfit = await setTakeProfit(symbol, q1, tp1, "sell");
        // console.log(takeProfit);
      } catch (error) {
        console.log(error);
      }
      try {
        takeProfit = await setTakeProfit(symbol, q2, tp2, "sell");
        // console.log(takeProfit);
      } catch (error) {
        console.log(error);
      }
      try {
        takeProfit = await setTakeProfit(symbol, q3, tp3, "sell");
        // console.log(takeProfit);
      } catch (error) {
        console.log(error);
      }
      try {
        takeProfit = await setTakeProfit(symbol, q4, tp4, "sell");
        // console.log(takeProfit);
      } catch (error) {
        console.log(error);
      }

      try {
        stopLoss = await setStopLoss(symbol, quantity, SL, "sell");
      } catch (error) {
        console.log(error);
      }
    } else {
      console.log(result);
    }
    // console.log(result, takeProfit, stopLoss, trailingsl);
    return result;
  } catch (error) {
    console.log(error);
    // return error;
  }
};

const openShortPosition = async (quantity, symbol, atr, prc, qty, sl, tp) => {
  try {
    let result = await binance.futuresMarketSell(symbol, quantity, {
      newOrderRespType: "RESULT",
    });
    // console.log(result);
    let takeProfit, stopLoss, trailingsl;
    if (result?.avgPrice !== undefined) {
      let sellPrice = parseFloat(result.avgPrice);
      let quantity = result?.executedQty;
      let tp1 = parseFloat(tp[0].toFixed(prc));
      let tp2 = parseFloat(tp[1].toFixed(prc));
      let tp3 = parseFloat(tp[2].toFixed(prc));
      let tp4 = parseFloat(tp[3].toFixed(prc));
      let SL = parseFloat(sl.toFixed(prc));
      let q1 = parseFloat((0.5 * quantity).toFixed(qty));
      let q2 = parseFloat((0.2 * quantity).toFixed(qty));
      let q3 = parseFloat((0.2 * quantity).toFixed(qty));
      let q4 = parseFloat((quantity - q1 - q2 - q3).toFixed(qty));
      // console.log(q1, q2, q3, q4);

      try {
        takeProfit = await setTakeProfit(symbol, q1, tp1, "buy");
        // console.log(takeProfit);
      } catch (error) {
        console.log(error);
      }
      try {
        takeProfit = await setTakeProfit(symbol, q2, tp2, "buy");
        // console.log(takeProfit);
      } catch (error) {
        console.log(error);
      }
      try {
        takeProfit = await setTakeProfit(symbol, q3, tp3, "buy");
        // console.log(takeProfit);
      } catch (error) {
        console.log(error);
      }
      try {
        takeProfit = await setTakeProfit(symbol, q4, tp4, "buy");
        // console.log(takeProfit);
      } catch (error) {
        console.log(error);
      }

      try {
        stopLoss = await setStopLoss(symbol, quantity, SL, "buy");
      } catch (error) {
        console.log(error);
      }
    } else {
      console.log(result);
    }
    // console.log(result, takeProfit, stopLoss, trailingsl);
    return result;
  } catch (error) {
    console.log(error);
    // return error;
  }
};
const setTakeProfit = async (symbol, quantity, price, side) => {
  let params1 = {
    type: "TAKE_PROFIT_MARKET",
    reduceOnly: true,
    timeInForce: "GTE_GTC",
    placeType: "position",
    workingType: "MARK_PRICE",
    stopPrice: price,
  };
  if (side === "sell") {
    res = await binance.futuresMarketSell(symbol, quantity, params1);
  } else {
    res = await binance.futuresMarketBuy(symbol, quantity, params1);
  }
  return res;
};
const setStopLoss = async (symbol, quantity, price, side) => {
  let params1 = {
    type: "STOP_MARKET",
    closePosition: true,
    timeInForce: "GTE_GTC",
    placeType: "position",
    workingType: "MARK_PRICE",
    stopPrice: price,
  };
  let res;
  if (side === "sell") {
    res = await binance.futuresMarketSell(symbol, quantity, params1);
  } else {
    res = await binance.futuresMarketBuy(symbol, quantity, params1);
  }
  return res;
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
