#!/usr/bin/env node

const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')
const { Capabilities, Builder, By, until } = require('selenium-webdriver');
const { Options } = require('selenium-webdriver/chrome');
const cheerio = require('cheerio');
const chrome = require('selenium-webdriver/chrome');
const wdLogging = require('selenium-webdriver/lib/logging');

require('chromedriver');

// Disable webdriver logging.
const loggingPrefs = new wdLogging.Preferences();
for (const logType in wdLogging.Type) {
    loggingPrefs.setLevel(logType, wdLogging.Level.OFF);
}

class CurrencyPricings {
	static CURRENCIES = {
		chromatic: [
			'OgMEkltE', // Chromatic < Chaos
			'BgM9OWS8' // Chaos < Chromatic
		],
		cartographer: [
			'zbVRF4',
			'4my8I9'
		],
		fusing: [
			'AjoXSX',
			'AoJrFl'
		],
		chance: [
			'X3JBsP',
			'0YR8Ig'
		],
		alchemy: [
			'yYYOiR',
			'rPe7CQ'
		],
		gemcutter: [
			'ADa4f5',
			'18jvcV'
		],
		regret: [
			'zbJai4',
			'9z6ztK'
		],
		vaal: [
			'18GVuV',
			'EB9LC5'
		],
		scour: [
			'rbdMHQ',
			'EBEzt5'
		],
		alteration: [
			'Ny7gfR',
			'AjnbtX'
		],
		blessed: [
			'Q2Q7Cw',
			'5n8nta'
		],
		regal: [
			'EBBVC5',
			'YpagsY'
		],
		glassblower: [
			'dkpQGqqcJ',
			'LBbWavXtn'
		],
		divine: [
			'9z28fK',
			'NpeJc0'
		],
		exalted: [
			'Nn8Vt0',
			'12R5ck'
		]
	};

	currentRunner = 0;
	runners = [];
	result = '';

	constructor(
		currencies,
		maxprofit,
		startrow,
		maxrow
	) {
		currencies.forEach(c => {
			const priceLinks = CurrencyPricings.CURRENCIES[c];
			if (priceLinks) {
				this.runners.push(
					new CurrencyPricingRunner(
						c,
						maxprofit,
						startrow,
						maxrow,
						CurrencyPricings.CURRENCIES[c]
					)
				)
			} else
				console.error(`Currency "${ c }" is not supported, skipping.`);
		});
	}

	async start() {
		return await this.priceNext();
	}

	async priceNext() {
		const nextRunner = this.runners[this.currentRunner];
		if (nextRunner) {
			let info;
			try {
				info = await nextRunner.go();
			} catch(err) {
				console.log('Rate limit exceeded, retrying in 60 seconds.');
				return new Promise(resolve => {
					setTimeout(
						() => resolve(this.priceNext()),
						60000
					); // Try again in a minute
				});
			}
			this.result += `${info}\n`;
		} else {
			let driver = await CurrencyPriceFetcher.createDriver();
			driver.quit(); // Close all drivers.
			return this.result;
		}
		this.currentRunner++;
		return this.priceNext();
	}
}


class CurrencyPricingRunner {

	constructor(
		currency,
		maxprofit,
		startrow,
		maxrow,
		links
	) {
		this.currency = currency;
		this.maxprofit = maxprofit || 10;
		this.startrow = startrow || 0;
		this.maxrow = maxrow;
		this.links = links;
	}

	async go() {
		const fetchers = [
			new CurrencyPriceFetcher(this.links[0]),
			new CurrencyPriceFetcher(this.links[1])
		];

		let prices;
		try {
			console.log(`Fetching ratios for ${ this.currency }...`);
			prices = await Promise.all([
				fetchers[0].go(this.startrow, this.maxrow),
				fetchers[1].go(this.startrow, this.maxrow),
			]);
		} catch(err) {
			let driver = await CurrencyPriceFetcher.createDriver();
			driver.quit(); // Close all drivers for now.
			throw new Error('Could not fetch prices, rate limit probably exceeded.');
		}

		let priceInfo = {
			sell: null,
			buy: null,
			profit: 0
		};

		const currencyToChaosPrices = prices[0];
		const chaosToCurrencyPrices = prices[1];
		let rowNum = 0;
		for (rowNum; rowNum < currencyToChaosPrices.sellPrices.length - 1; rowNum++) {
			const info = this.getPriceInfo(currencyToChaosPrices, chaosToCurrencyPrices, rowNum);
			if (info.profit <= this.maxprofit)
				priceInfo = info;
			else
				break;
		}

		let noProfitBelow = false;
		if (!priceInfo.sell) {
			noProfitBelow = true;
			priceInfo = this.getPriceInfo(currencyToChaosPrices, chaosToCurrencyPrices, 0)
		}

		let out = `\n${this.currency} > chaos\n`;
		out += `${ priceInfo.sell }\n`;
		out += `chaos > ${this.currency}\n`;
		out += `${ priceInfo.buy }\n`;
		if (priceInfo.profit < 1)
			out += `${ priceInfo.profit === 0 ? 'No' : 'Negative' } profit: ${ priceInfo.profit }%`;
		else
			out += `Profit: ${ priceInfo.profit }% (~row ${ this.startrow + rowNum + 1 })`;
		if (noProfitBelow)
			out += `\n(Could not find row pairs matching a maxprofit of ${ this.maxprofit }%)`;
		return out;
	}

	getPriceInfo(
		currencyToChaos,
		chaosToCurrency,
		row
	) {
		const sellRatio = currencyToChaos.sellPrices[row] / currencyToChaos.buyPrices[row];
		const buyRatio = chaosToCurrency.buyPrices[row] / chaosToCurrency.sellPrices[row];
		console.log();
		const profit = Math.round((buyRatio / sellRatio - 1) * 100);

		const info = {
			sell: '',
			buy: '',
			profit: profit
		};

		const sellMaxDivisible = this.gcd(currencyToChaos.buyPrices[row], currencyToChaos.sellPrices[row]);
		info.sell = `${ currencyToChaos.buyPrices[row] }/${ currencyToChaos.sellPrices[row] }`
		info.sell += ` (${ currencyToChaos.buyPrices[row] / sellMaxDivisible }/${ currencyToChaos.sellPrices[row] / sellMaxDivisible })`;

		const buyMaxDivisible = this.gcd(chaosToCurrency.buyPrices[row], chaosToCurrency.sellPrices[row]);
		info.buy = `${ chaosToCurrency.buyPrices[row] }/${ chaosToCurrency.sellPrices[row] }`;
		info.buy += ` (${ chaosToCurrency.buyPrices[row] / buyMaxDivisible }/${ chaosToCurrency.sellPrices[row] / buyMaxDivisible })`;

		return info;
	}

	gcd(a, b) {
		if (!b)
			return a;

		return this.gcd(b, a % b);
	}
}

class CurrencyPriceFetcher {

	constructor(link) {
		this.link = link;
	}

	async go(
		startrow,
		maxrow
	) {

		let driver = await CurrencyPriceFetcher.createDriver();
		try {
			await driver.get(`https://www.pathofexile.com/trade/exchange/Ritual/${this.link}`);

			await driver.wait(until.elementLocated(By.className('row exchange')), 6000);
			let exchangeEls = await driver.findElements(By.className('row exchange'));
			const firstExchangeElsCount = exchangeEls.length;

			const loadMoreButton = await driver.findElement(By.className('load-more-btn'));

			await driver.wait(until.elementTextIs(loadMoreButton, 'Load More'), 2000);
			await loadMoreButton.click();
			await driver.wait(() => {
				return driver.findElements(By.className('row exchange')).then((elements) => {
					return elements.length !== firstExchangeElsCount;
				});
			}, 6000);

			const pageSource = await driver.getPageSource();
			const $ = cheerio.load(pageSource);

			const result = {
				sellPrices: [],
				buyPrices: []
			};
			let rows = $('.row.exchange');
			let numRows = maxrow ? startrow + maxrow : rows.length - 1;
			if (numRows > rows.length - 1)
				numRows = rows.length - 1;
			rows = rows.slice(
				startrow,
				numRows
			);
			rows.each((i, elem) => {
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
			await driver.close();
		}
	}

	static async createDriver() {
		let options = new Options();
		options.headless();
		options.excludeSwitches('enable-logging')

		return new Builder()
			.forBrowser('chrome')
			.setChromeOptions(options)
			.build();
	}
}

(async () => {
	let { currencies, maxprofit = 10, startrow, maxrow } = yargs(hideBin(process.argv)).argv

	if (!startrow)
		startrow = 0;
	else
		startrow = startrow - 1;

	if (!currencies) {
		console.error('No currencies defined');
		return;
	}

	if (maxrow && (startrow || 0) + maxrow > 40) {
		console.error('Startrow + maxrow cannot be higher than 40');
		return;
	}

	const currencyPricings = new CurrencyPricings(
		currencies.split(','),
		maxprofit,
		startrow,
		maxrow
	);
	const pricings = await currencyPricings.start();
	console.log(pricings);
})();
