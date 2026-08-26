var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// e2e/unit/out/currency.ts
var currency_exports = {};
__export(currency_exports, {
  usdCentsToKhr: () => usdCentsToKhr
});
module.exports = __toCommonJS(currency_exports);
function usdCentsToKhr(usdCents, rate, increment = 100) {
  const exact = Math.trunc(usdCents) * Math.trunc(rate);
  const unit = Math.trunc(increment) * 100;
  const khr = Math.floor((exact + Math.floor(unit / 2)) / unit) * increment;
  return { khr, settlementRoundingKhr: khr - Math.floor(exact / 100) };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  usdCentsToKhr
});
