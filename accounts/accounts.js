const Binance = require("node-binance-api");
const fs = require("fs");
const fs1 = require("fs/promises");
let cache = require("persistent-cache");
let income = cache({ base: "incomes", name: "incomes" });
const { log } = console;

var binance = new Binance().options({
  APIKEY: process.env.API_KEY,
  APISECRET: process.env.SECRET_KEY,
  recvWindow: 60000 * 2,
  hedgeMode: true,
  useServerTime: true,
  verbose: true,
  reconnect: true,
  family: 4,
});
exports.futuresAccount = async (req, res) => {
  try {
    let account = await binance.futuresAccount();
    let { positions } = account;
    let coins = positions.filter(
      (position) => parseFloat(position.positionAmt) !== 0
    );
    return res.json(account);
  } catch (e) {
    console.log(e);
  }
};
const bookProfit = (coin) => {
  const { symbol, positionAmt } = coin;
  if (parseFloat(positionAmt) > 0) {
    binance
      .futuresMarketSell(symbol, parseFloat(positionAmt), {
        // reduceOnly: true,
        newOrderRespType: "RESULT",
        positionSide: "LONG",
      })
      .then((res) => {
        // console.log(res);
        console.log(`${res.symbol} closed`);
      })
      .catch((err) => {
        console.log(err);
      });
  }
  if (parseFloat(positionAmt) < 0) {
    binance
      .futuresMarketBuy(symbol, Math.abs(parseFloat(positionAmt)), {
        // reduceOnly: true,
        newOrderRespType: "RESULT",
        positionSide: "SHORT",
      })
      .then((res) => {
        // console.log(res);
        console.log(`${res.symbol} closed`);
      })
      .catch((err) => {
        console.log(err);
      });
  }
};
exports.getUnrealizedProfitCoins = async (req, res) => {
  try {
    let account = await binance.futuresAccount();
    let positions = account.positions.filter(
      (coin) => parseFloat(coin.positionAmt) !== 0
    );
    // console.log(positions);
    let profits = 0;
    let amount = 0;
    if (positions.length > 0) {
      for (let i = 0; i < positions.length; i++) {
        profits += parseFloat(positions[i]?.unrealizedProfit);
        amount += parseFloat(positions[i]?.positionInitialMargin);
      }
    }

    if ((profits * 100) / amount > 10) {
      for (let i = 0; i < positions.length; i++) {
        // if(  orders.has(symbol)&&orders.)
        bookProfit(positions[i]);
      }
    }
  } catch (e) {
    console.log(e);
    return;
  }
};
exports.getFuturesBalances = async (req, res) => {
  try {
    let account = await binance.futuresAccount();
    // console.info(await binance.futuresExchangeInfo());
    let { totalMarginBalance } = account;
    const { assets } = await binance.futuresAccount();
    let positionsRisk = await binance.futuresPositionRisk();
    let usdt = assets.filter((asset) => asset.asset === "USDT")[0];
    let { availableBalance, walletBalance, unrealizedProfit } = usdt;
    let openPositions = positionsRisk.filter(
      (position) => parseInt(position.positionAmt) !== 0
    );
    // console.log(availableBalance, totalMarginBalance, walletBalance, unrealizedProfit, openPositions);
    return res.send({
      availableBalance,
      totalMarginBalance,
      walletBalance,
      unrealizedProfit,
      openPositions,
    });
  } catch (e) {
    return res.send(e);
  }
};
const writeToFile = (trades) => {
  return fs.readFile("./income.json", "utf-8", (err, fileData) => {
    if (err) {
      console.log("Error loading file");
    } else {
      try {
        let incomes = [];
        if (fileData) {
          incomes = JSON.parse(fileData);
        }
        let oldLength = incomes.length;
        let tnxIds = new Map();
        for (let i = 0; i < incomes.length; i++) {
          if (!tnxIds.has(incomes[i].tranId)) {
            tnxIds.set(incomes[i].tranId, 1);
          }
        }
        for (let i = 0; i < trades.length; i++) {
          if (!tnxIds.has(trades[i].tranId)) {
            incomes.push(trades[i]);
          }
        }
        let newLength = incomes.length;
        fs.writeFile("./income.json", JSON.stringify(incomes), (err) => {
          if (err) console.log(err);
          if (newLength - oldLength > 0)
            console.log(`${newLength - oldLength} new records added`);
        });
      } catch (error) {
        return [];
      }
    }
  });
};
const writeToCache = (trades) => {
  for (let i = 0; i < trades.length; i++) {
    let tradeDate = new Date(trades[i].time)
      .toDateString()
      .split(" ")
      .join("-");
    // console.log(tradeDate);
    // tradeDate.replace('', '-');
    let date = income.getSync(tradeDate);
    console.log(date);
    if (date == undefined) {
      income.putSync(tradeDate, [trades[i]]);
    } else {
      let tradeExist = date.filter(
        (trade) => trade.tradeId === trades[i].tradeId
      );
      if (tradeExist.length === 0) {
        date.push(trades[i]);
      }
    }
    income.putSync(tradeDate, date);
  }
  return fs.readFile("./income.json", "utf-8", (err, fileData) => {
    if (err) {
      console.log("Error loading file");
    } else {
      try {
        let incomes = [];
        if (fileData) {
          incomes = JSON.parse(fileData);
        }
        let oldLength = incomes.length;
        let tnxIds = new Map();
        for (let i = 0; i < incomes.length; i++) {
          if (!tnxIds.has(incomes[i].tranId)) {
            tnxIds.set(incomes[i].tranId, 1);
          }
        }
        for (let i = 0; i < trades.length; i++) {
          if (!tnxIds.has(trades[i].tranId)) {
            incomes.push(trades[i]);
          }
        }
        let newLength = incomes.length;
        fs.writeFile("./income.json", JSON.stringify(incomes), (err) => {
          if (err) console.log(err);
          if (newLength - oldLength > 0)
            console.log(`${newLength - oldLength} new records added`);
        });
      } catch (error) {
        return [];
      }
    }
  });
};
const readFromFile = () => {
  let pnl = fs.readFileSync("./income.json", "utf-8");
  return JSON.parse(pnl);
};
function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString({ en: "IN" });
}
function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString({ en: "IN" });
}
exports.getIncome = async (req, res) => {
  try {
    let trades, commissions;
    if (req?.body?.start && req?.body?.end) {
      let start = new Date(`${req.body.start}T00:00:00.001`);
      let end = new Date(`${req.body.end}T23:59:59.000`);
      let startTime = start.getTime();
      let endTime = end.getTime();
      let income = await binance.futuresIncome({
        incomeType: "REALIZED_PNL",
        startTime,
        endTime,
        limit: "1000",
      });
      let commission = binance.futuresIncome({
        incomeType: "COMMISSION",
        startTime,
        endTime,
        limit: "1000",
      });
      let [pnl, fees] = await Promise.all([income, commission]);
      trades = pnl;
      commissions = fees;
      // console.log(pnl, fees);
    } else {
      let income = await binance.futuresIncome({
        incomeType: "REALIZED_PNL",
        limit: "1000",
      });
      let commission = await binance.futuresIncome({
        incomeType: "COMMISSION",
        limit: "1000",
      });
      let [pnl, fees] = await Promise.all([income, commission]);
      trades = pnl;
      commissions = fees;
      // console.log(pnl, fees);
    }
    // return;
    writeToFile(trades);
    let length = trades.length;
    let commission = 0;
    let i = 0;
    let coins = new Map();

    let profits = 0;
    let losses = 0;
    let totalProfit = 0;
    let totalLoss = 0;
    while (i < length) {
      let { symbol, income } = trades[i];
      // console.log(trades[i]);
      let inc = parseFloat(income);
      if (inc > 0) {
        let prevProfit = coins.has(symbol) ? coins.get(symbol) : 0;
        coins.set(symbol, prevProfit + inc);
        totalProfit += inc;
        profits++;
      } else {
        let prevLoss = coins.has(symbol) ? coins.get(symbol) : 0;
        coins.set(symbol, prevLoss + inc);
        totalLoss += inc;
        losses++;
      }
      i++;
    }
    for (let i = 0; i < commissions.length; i++) {
      commission += parseFloat(commissions[i].income);
    }

    let pnl = totalProfit + totalLoss + commission;
    return {
      profit: totalProfit,
      loss: totalLoss,
      pnl,
      commission,
      winpercent: (profits * 100) / (profits + losses),
      profits,
      losses,
      coins: Object.fromEntries(coins),
    };
  } catch (e) {
    console.log(e);
    return e;
  }
};
exports.getPnl = async (req, res) => {
  try {
    let startDate = new Date(`${req.query.year}-01-01T00:00:00.001Z`);
    let endDate = new Date(`${req.query.year}-12-31T23:59:59.000Z`);
    let startTime = startDate.getTime();
    let endTime = endDate.getTime();
    let pnl = readFromFile();
    console.log(pnl.length);
    let trades = [];
    for (let i = 0; i < pnl.length; i++) {
      if (
        parseInt(pnl[i].time) > startTime &&
        parseInt(pnl[i].time) < endTime
      ) {
        trades.push(pnl[i]);
      }
    }
    return res.send(trades);
  } catch (e) {
    return res.send(e);
  }
};
exports.getFuturesOpenPositons = async (req, res) => {
  try {
    let positions = await binance.futuresPositionRisk();
    let openPositions = positions.filter(
      (position) => parseInt(position.positionAmt) !== 0
    );
    return res.send(openPositions);
  } catch (e) {
    res.send(e);
  }
};
exports.getOpenPositons = async () => {
  try {
    let positions = await binance.futuresPositionRisk();
    let openPositions = positions.filter(
      (position) => parseInt(position.positionAmt) !== 0
    );
    return openPositions;
  } catch (e) {
    return e;
  }
};
