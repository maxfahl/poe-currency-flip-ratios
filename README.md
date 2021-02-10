# poe-currency-pricings

A very simple node script for helping with currency flipping. It scrapes the poe trade site for sell/buy ratios of a certain currency. It has been tested on Mac OS Big Sur as well as Windows 10.

It currently gets prices for rows 16 to 24, returning the mean value for those buy/sell values.

#### Prerequisites:
- Node JS
- Chrome version 88 (needs to be installed on the computer)

Install: `yarn install / npm install`

Run: `node ./poe-currency-pricings.js ...args`

#### Args:
- `--currencies=LIST_OF_CURRENCIES` A comma separated list of currencies.
- `--maxprofit=PERCENT` The maximum profit margin. The higher the number, the lower you'll end up in the search results.
- `--startrow=STARTROW` The row we will start looking for prices on.
- `--maxrow=MAXROW` The maximum number of rows from the startrow we will parse.

#### Example:
`node ./poe-currency-pricings.js --currencies=chromatic,cartographer,fusing --maxprofit=15 --startrow=10 --maxrow=15`

#### Supported currencies:
- chromatic
- cartographer
- fusing
- chance
- alchemy
- gemcutter
- regret
- vaal
- alteration
- blessed
- regal
- glassblower
- divine
- exalted

Other currencies can be added at the top of the script, the first string is the trade link suffix for the currency you want to sell, the other is for when you want to buy that same currency for chaos.

#### Result example:

```
chromatic > chaos
100/690 (10/69)
chaos > chromatic
370/51 (370/51)
Profit: 5% (~row 23)

divine > chaos
9/1 (9/1)
chaos > divine
10/86 (5/43)
Profit: 5% (~row 23)
```

"chromatic > chaos 100/690" means that you should price a chromatic in your premium stash tab "100/690" of a chaos. "chaos > chromatic 370/51" mean you should price a chaos for "370/51" of a chromatic. All trades will give a profit margin for that trade, as well as an expected position. The numbers in parentheses is the maximum common divisible for that ratio, 10/69 is the same ratio as 100/690, but you will sell 69 chromatics for 10 chaos, instead of 690 chromatics for 100 chaos, which can result in more trade requests, but make less money per trade.

##### Thanks, let me know how it works for you!
