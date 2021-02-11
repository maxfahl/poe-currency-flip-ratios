#!/usr/bin/env node

const yargs = require('yargs/yargs')
const {hideBin} = require('yargs/helpers')
const {Builder, By, until} = require('selenium-webdriver');
const {Options} = require('selenium-webdriver/chrome');
const cheerio = require('cheerio');
const wdLogging = require('selenium-webdriver/lib/logging');
const fs = require('fs');

const currencyLinks = require('./currency-links.json');

require('selenium-webdriver/chrome');
require('chromedriver');

// Disable webdriver logging.
const loggingPrefs = new wdLogging.Preferences();
for (const logType in wdLogging.Type) {
	loggingPrefs.setLevel(logType, wdLogging.Level.OFF);
}

class CurrencyPricings {
	currencies;
	profit;
	startrow;
	numrows;

	priceCache;
	currentRunner = 0;
	runners = [];
	resultInfo = '';
	retryCount = 0;

	constructor(
		currencies,
		profit,
		startrow,
		numrows,
		debug,
		offline
	) {
		CurrencyPricings.DEBUG = debug;
		CurrencyPricings.OFFLINE = offline;

		this.currencies = currencies;
		this.profit = profit;
		this.startrow = startrow;
		this.numrows = numrows;
	}

	async start() {
		try {
			let priceCacheRaw = await fs.readFileSync('price-cache.json');
			if (priceCacheRaw)
				this.priceCache = JSON.parse(priceCacheRaw);
		} catch (err) {
			this.priceCache = {};
		}

		this.currencies.forEach(c => {
			const priceLinks = currencyLinks[c];
			if (priceLinks) {
				this.runners.push(
					new CurrencyPricingRunner(
						c,
						this.profit,
						this.startrow,
						this.numrows,
						this.priceCache[c],
						currencyLinks[c]
					)
				)
			} else
				console.error(`Currency "${c}" is not supported, skipping.`);
		});

		return await this.priceNext();
	}

	async priceNext() {
		const currentRunner = this.runners[this.currentRunner];
		if (currentRunner) {
			let result;
			try {
				result = await currentRunner.go();
				this.retryCount = 0;
			} catch (err) {
				this.retryCount++;
				console.log(`Rate limit exceeded, trying again in 60 seconds (${this.retryCount}).`);
				return new Promise(resolve => {
					setTimeout(
						() => resolve(this.priceNext()),
						60000
					); // Try again in a minute
				});
			}
			this.priceCache[currentRunner.currency] = result.prices;
			this.resultInfo += `${result.info}\n`;
		} else {
			let driver = await CurrencyPriceFetcher.createDriver();
			driver.quit(); // Close all drivers.
			await fs.writeFileSync('price-cache.json', JSON.stringify(this.priceCache));
			return this.resultInfo;
		}
		this.currentRunner++;
		return this.priceNext();
	}
}


class CurrencyPricingRunner {

	constructor(
		currency,
		profit,
		startrow,
		numrows,
		priceCache,
		links
	) {
		this.currency = currency;
		this.profit = profit;
		this.startrow = startrow;
		this.numrows = numrows;
		this.priceCache = priceCache;
		this.links = links;
	}

	async go() {
		const fetchers = [
			new CurrencyPriceFetcher(this.links[0]),
			new CurrencyPriceFetcher(this.links[1])
		];

		let prices;
		if (CurrencyPricings.OFFLINE) {
			prices = this.priceCache;
		} else {
			try {
				console.log(`Fetching ratios for ${this.currency}...`);
				prices = await Promise.all([
					fetchers[0].go(this.startrow, this.numrows),
					fetchers[1].go(this.startrow, this.numrows),
				]);
			} catch (err) {
				let driver = await CurrencyPriceFetcher.createDriver();
				driver.quit(); // Close all drivers for now.
				throw new Error('Could not fetch prices, rate limit probably exceeded.');
			}
		}

		let totalNumPrices = prices[0].sellPrices.length;
		let startRow = this.startrow < totalNumPrices ? this.startrow : totalNumPrices - 1;
		let endRow = Math.min(this.numrows ? startRow + this.numrows : totalNumPrices - 1, totalNumPrices - 1);

		const trimmedPrices = prices.map(set => ({
			sellPrices: set.sellPrices.slice(startRow, endRow),
			buyPrices: set.buyPrices.slice(startRow, endRow)
		}));
		const currencyToChaosPrices = trimmedPrices[0];
		const chaosToCurrencyPrices = trimmedPrices[1];
		let priceInfo = {
			sell: null,
			buy: null,
			profit: 0
		};

		let rowNum = 0;
		for (rowNum; rowNum < currencyToChaosPrices.sellPrices.length - 1; rowNum++) {
			const info = this.getPriceInfo(currencyToChaosPrices, chaosToCurrencyPrices, rowNum);
			if (info.profit <= this.profit)
				priceInfo = info;
			else
				break;
		}

		let noProfitBelow = false;
		if (!priceInfo.sell) {
			noProfitBelow = true;
			priceInfo = this.getPriceInfo(currencyToChaosPrices, chaosToCurrencyPrices, 0)
		}

		let info = `\n${this.currency} > chaos\n`;
		info += `${priceInfo.sell}\n`;
		info += `chaos > ${this.currency}\n`;
		info += `${priceInfo.buy}\n`;
		if (priceInfo.profit < 1)
			info += `${priceInfo.profit === 0 ? 'No' : 'Negative'} profit: ${priceInfo.profit}%`;
		else
			info += `Profit: ${priceInfo.profit}% (~row ${this.startrow + rowNum + 1})`;
		if (noProfitBelow)
			info += `\n(Could not find row pairs matching a maxprofit of ${this.profit}%)`;

		return {
			info,
			prices
		};
	}

	getPriceInfo(
		currencyToChaos,
		chaosToCurrency,
		row
	) {
		const sellRatio = currencyToChaos.sellPrices[row] / currencyToChaos.buyPrices[row];
		const buyRatio = chaosToCurrency.buyPrices[row] / chaosToCurrency.sellPrices[row];
		const profit = Math.round((buyRatio / sellRatio - 1) * 100);

		const info = {
			sell: '',
			buy: '',
			profit: profit
		};

		const sellMaxDivisible = this.gcd(currencyToChaos.buyPrices[row], currencyToChaos.sellPrices[row]);
		info.sell = `${currencyToChaos.buyPrices[row]}/${currencyToChaos.sellPrices[row]}`
		info.sell += ` (${currencyToChaos.buyPrices[row] / sellMaxDivisible}/${currencyToChaos.sellPrices[row] / sellMaxDivisible})`;

		const buyMaxDivisible = this.gcd(chaosToCurrency.buyPrices[row], chaosToCurrency.sellPrices[row]);
		info.buy = `${chaosToCurrency.buyPrices[row]}/${chaosToCurrency.sellPrices[row]}`;
		info.buy += ` (${chaosToCurrency.buyPrices[row] / buyMaxDivisible}/${chaosToCurrency.sellPrices[row] / buyMaxDivisible})`;

		return info;
	}

	gcd(a, b) {
		if (!b)
			return a;

		return this.gcd(b, a % b);
	}
}

class CurrencyPriceFetcher {

	driver;

	constructor(link) {
		this.link = link;
	}

	async go(
		startrow,
		numrows
	) {
		this.driver = await CurrencyPriceFetcher.createDriver();
		try {
			await this.driver.get(`https://www.pathofexile.com/trade/exchange/Ritual/${this.link}`);
			await this.driver.wait(until.elementLocated(By.className('row exchange')), 6000);
			const rowsToLoad = Math.max(startrow + numrows, 20);
			const pagesToLoad = Math.floor((rowsToLoad - 20) / 20);
			const exchangeEls = await this.driver.findElements(By.className('row exchange'));
			let lastNumRows = exchangeEls.length;
			try {
				for (let i = 0; i < pagesToLoad; i++) {
					const numRows = await this.loadMore(lastNumRows);
					if (lastNumRows !== numRows) {
						lastNumRows = numRows;
					} else {
						break;
					}
				}
			} catch (err) {
				// Just continue, no more pages to load.
			}

			const pageSource = await this.driver.getPageSource();
			const $ = cheerio.load(pageSource);

			const result = {
				sellPrices: [],
				buyPrices: []
			};

			$('.row.exchange').each((i, elem) => {
				const row = $(elem);
				const priceBlocks = row.find('.price-block');
				const sellBlock = $(priceBlocks.get(0));
				const buyBlock = $(priceBlocks.get(1));
				const sellPrice = sellBlock.find('span').last();
				const buyPrice = buyBlock.find('span').first();
				result.sellPrices.push(+sellPrice.text());
				result.buyPrices.push(+buyPrice.text());
			});

			return result;
		} finally {
			await this.driver.close();
		}
	}

	async loadMore(lastNumRows) {
		const loadMoreButton = await this.driver.findElement(By.className('load-more-btn'));
		await this.driver.wait(until.elementTextIs(loadMoreButton, 'Load More'), 2000);
		await loadMoreButton.click();
		await this.driver.wait(() => {
			return this.driver.findElements(By.className('row exchange')).then((elements) => {
				return elements.length !== lastNumRows;
			});
		}, 6000);

		const currentNuRows = await this.driver.findElements(By.className('row exchange'))
		return currentNuRows.length;
	}

	static async createDriver() {
		let options = new Options();
		if (!CurrencyPricings.DEBUG)
			options.headless();
		options.excludeSwitches('enable-logging');

		return new Builder()
			.forBrowser('chrome')
			.setChromeOptions(options)
			.build();
	}
}

(async () => {
	let {currencies, profit = 10, startrow = 0, numrows = 40, debug, offline} = yargs(hideBin(process.argv)).argv

	if (!startrow)
		startrow = 0;
	else
		startrow = startrow - 1;

	if (!currencies) {
		console.error('No currencies defined');
		return;
	}

	const currencyPricings = new CurrencyPricings(
		currencies.split(','),
		profit,
		startrow,
		numrows,
		!!debug,
		!!offline
	);
	const pricings = await currencyPricings.start();
	console.log(pricings);
})();
