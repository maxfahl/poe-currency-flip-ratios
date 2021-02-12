# poe-currency-pricings

A node script for helping with currency flipping. It scrapes the pathofexile trade site for currency sell/buy ratios. It has been tested on Mac OS Big Sur as well as Windows 10.

#### Prerequisites:
- Node JS

Install: `yarn install / npm install`  
Run: `node ./poe-currency-pricings.js ...args`

#### Args:
- `--currencies=LIST_OF_CURRENCIES` A comma separated list of currencies.
- `--profit=PERCENT` Desired profit margin, defaults to 10.
- `--startrow=STARTROW` The row we will start looking for prices on, defaults to 0,
- `--numrows=NUMROWS` The maximum number of rows from the startrow we will parse, defaults to 40.
- `--offline` Will not get prices from site, instead uses a local cache.
- `--debug` More verbose logging.

#### Example:
`node ./poe-currency-pricings.js --currencies=vaal,chrome,fusing,chisel --profit=10 --startrow=10 --numrows=15`

#### Supported currencies:

Every currency listed [here](https://www.pathofexile.com/trade/about) is supported. Use tho short variation of the currency name with the script, for example, use "chrome", not "Chromatic Orb".

#### Result example:

```
vaal > chaos
60/100 (3/5)
chaos > vaal
38/20 (19/10)
Profit: 14% (~row 20)

chrome > chaos
14/97 (14/97)
chaos > chrome
235/30 (47/6)
Profit: 13% (~row 24)
```

"vaal > chaos 60/100" means that you should price a vaal in your premium stash tab "60/100" of a chaos. "chaos > vaal 38/20" mean you should price a chaos for "38/20" of a vaal. All trades will give a profit margin for that trade, as well as an expected position in the listings. The numbers in parentheses is the maximum common divisible for that ratio, 3/5 is the same ratio as 60/100, but you will sell 5 vaal for 3 chaos, instead of 100 vaal for 60 chaos, which can result in more trade requests, but make less money per trade.

#### Caveats

- Offline mode can only calculate ratios for currencies that you've fetched prices for in online mode before, and will be based on what the prices looked like at that moment in time.

##### Thanks, let me know how it works for you!
