# PoE Currency Flip Ratios

## NOTICE

I have abandoned this script since the trade API is no longer publicly accessible. That means a script such as this don't work anymore. You'd have to register for a sort of developer account with GGG, and I don't want to risk anything since this script might be seen as a cheat. Thanks to all of you who tried it out. Will probably remove this repo in the coming weeks.

##### A node script that helps finding good sell/buy ratios for currency flipping via the PoE JSON REST API.

#### Prerequisites
- Node JS

Install: `yarn install` or `npm install`  
Run: `node ./poe-currency-pricings.js ...args`

#### Arguments
| Argument | Value | Explanation | Default
--- | --- | --- | ---
| league | string | The league to get currency ratios for | Ultimatum
| currencies | comma separated list of strings | A comma separated list of currencies. |
| profit | number | Desired profit margin (optional) | 10
| startrow | number | The row we will start looking for prices on (optional) | 0
| numrows | number | Number of rows from the startrow we will examine (optional) | 40
| offline | boolean | Use local cache instead of live results (optional) |
| debug | boolean | Verbose logging (optional) |

#### Example
```bash
node ./poe-currency-pricings.js --currencies=vaal,chrome,fusing,chisel --profit=10 --startrow=10 --numrows=15
```

#### Supported currencies

Every currency listed [here](https://www.pathofexile.com/trade/about) is supported. Use the short variation of the currency name (chrome, gcp etc.).

#### Result example

```text
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

The result is also saved to a textfile named result.txt, where the text can be more easily copied from.

#### Caveats

- Offline mode can only calculate ratios for currencies that you've fetched prices for in online mode before, and will be based on what the prices looked like at that moment in time.

##### Thanks, let me know how it works for you!
