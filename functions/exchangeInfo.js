const Binance = require("node-binance-api");
var binance = new Binance().options({
  APIKEY: process.env.API_KEY,
  APISECRET: process.env.SECRET_KEY,
  recvWindow: 60000,
  useServerTime: true,
  hedgeMode: true,
  verbose: true,
  reconnect: true,
  family: 4,
});

async function getExchangeInfo() {
  return new Promise(async (resolve, reject) => {
    try {
      let { symbols } = await binance.futuresExchangeInfo();
      let pricePrecision = new Map();
      let quantityPrecision = new Map();
      let minimumQuantity = new Map();
      let minimumNotional = new Map();
      symbols?.forEach((obj) => {
        if (obj?.quoteAsset === "USDT" && obj?.status === "TRADING") {
          let { filters } = obj;
          let lot_size = filters.find((ele) => ele?.filterType === "LOT_SIZE");
          let min_notional = filters.find(
            (ele) => ele?.filterType === "MIN_NOTIONAL"
          );
          pricePrecision.set(obj?.symbol, parseInt(obj?.pricePrecision));
          quantityPrecision.set(obj?.symbol, obj?.quantityPrecision);
          minimumQuantity.set(obj?.symbol, Number(lot_size?.minQty));
          minimumNotional.set(obj?.symbol, Number(min_notional?.notional));
        }
      });
      resolve({
        pricePrecision,
        quantityPrecision,
        minimumQuantity,
        minimumNotional,
      });
    } catch (error) {
      console.log(error);
      reject(error);
    }
  });
}
module.exports = {
  getExchangeInfo,
};
