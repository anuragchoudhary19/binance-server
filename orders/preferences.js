const Binance = require('node-binance-api');
var binance = new Binance().options({
  APIKEY: process.env.API_KEY,
  APISECRET: process.env.SECRET_KEY,
  recvWindow: 60000,
});

exports.adjustLeverage = async (req, res) => {
  try {
    let leverage = req.params.leverage;
    let { positions } = await binance.futuresAccount();
    let levBracketPromises = [];
    for (let i = 0; i < positions.length; i++) {
      levBracketPromises.push(binance.futuresLeverageBracket(positions[i].symbol));
    }
    let levBrackets = await Promise.all(levBracketPromises);
    let levBracketsOfActiveCoins = levBrackets.filter((r) => Array.isArray(r));
    let maxLeverages = new Map();
    for (let i = 0; i < levBracketsOfActiveCoins.length; i++) {
      maxLeverages.set(
        levBracketsOfActiveCoins[i][0].symbol,
        levBracketsOfActiveCoins[i][0].brackets[0].initialLeverage
      );
    }
    let levChangePromises = [];
    for (let i = 0; i < positions.length; i++) {
      if (positions[i].leverage !== leverage) {
        if (leverage > maxLeverages.get(positions[i].symbol)) {
          levChangePromises.push(binance.futuresLeverage(positions[i].symbol, maxLeverages.get(positions[i].symbol)));
        } else {
          levChangePromises.push(binance.futuresLeverage(positions[i].symbol, leverage));
        }
      }
    }
    let result = await Promise.all(levChangePromises);
    return res.send(result);
  } catch (error) {
    return res.send(error);
  }
};
exports.adjustMarginMode = async (req, res) => {
  try {
    let mode = req.params.mode;
    let { positions } = await binance.futuresAccount();
    let promises = [];
    for (let i = 0; i < positions.length; i++) {
      if (mode === 'isolated' && !positions[i].isolated) {
        promises.push(binance.futuresMarginType(positions[i].symbol, 'ISOLATED'));
      }
      if (mode === 'cross' && positions[i].isolated) {
        promises.push(binance.futuresMarginType(positions[i].symbol, 'CROSSED'));
      }
    }
    let result = await Promise.all(promises);
    return res.send(result);
  } catch (error) {
    return res.send(error);
  }
};
