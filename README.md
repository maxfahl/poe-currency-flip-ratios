# poe-currency-pricings

A very simple node script for helping with currency flipping. It scrapes the poe trade site for sell/buy values of a certain currency. It has only been tested on my mac on "Big Sur".

It currently gets prices for rows 16 to 24, returning the mean value for those buy/sell values.

Prerequisites:
    • Node JS 
    • Chrome version 88 (needs to be installed on computer)

Install: `yarn install`

Run: `node ./poe-currency-pricings.js ...currencies`

Example: `node ./poe-currency-pricings.js chromatic cartographer`

Supported currencies are: chromatic, cartographer, fusing, chance, alchemy and exalted

Other currencies can be added at the top of the script, the first string is the trade link suffix for the currency you want to sell, the other is for when you want to buy that same currency for chaos.

The result will look something like this:

```
chromatic > chaos
4/25
chaos > chromatic
209/30
Profit: 1.1%

cartographer > chaos
16/53
chaos > cartographer
31/9
Profit: 1%

fusing > chaos
1/4
chaos > fusing
151/35
Profit: 1.1%
```

"fusing > chaos 1/4" means that you should price a fusing in your premium stash tab "1/4" of a chaos. "chaos > fusing 151/35" mean you should price a chaos for "151/35" of a fusing. All trades will give a profit margin for that trade.
