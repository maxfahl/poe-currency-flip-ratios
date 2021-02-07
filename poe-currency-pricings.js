const { Builder, By, until } = require('selenium-webdriver');
const cheerio = require('cheerio');

require('selenium-webdriver/chrome');
require('chromedriver');

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
		gemcutters: [
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

	constructor(currencies) {
		currencies.forEach(c => {
			const priceLinks = CurrencyPricings.CURRENCIES[c];
			if (priceLinks) {
				this.runners.push(
					new CurrencyPricingRunner(
						c,
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
			this.result += `${info}\n\n`;
		} else {
			let driver = await CurrencyPriceFetcher.createDriver();
			driver.quit(); // Close all drivers for now.
			return this.result;
		}
		this.currentRunner++;
		return this.priceNext();
	}
}


class CurrencyPricingRunner {

	constructor(currency, links) {
		this.currency = currency;
		this.links = links;
	}

	async go() {
		const fetchers = [
			new CurrencyPriceFetcher(this.links[0]),
			new CurrencyPriceFetcher(this.links[1])
		];

		let prices;
		try {
			console.log(`Fetching ratios for "${ this.currency }"`);
			prices = await Promise.all([
				fetchers[0].go(),
				fetchers[1].go(),
			]);
		} catch(err) {
			let driver = await CurrencyPriceFetcher.createDriver();
			driver.quit(); // Close all drivers for now.
			throw new Error('Could not fetch prices, rate limit probably exceeded.');
		}

		let out = `${this.currency} > chaos\n`;
		out += `${prices[0][1]}/${prices[0][0]}\n`;
		out += `chaos > ${this.currency}\n`;
		out += `${prices[1][1]}/${prices[1][0]}\n`;
		const chaosPerCurrency = prices[0][1] / prices[0][0];
		const currencyPerChaos = prices[1][0] / prices[1][1];
		const profit = Math.round((chaosPerCurrency / currencyPerChaos - 1) * 100);
		out += `Profit: ${ profit }%`;
		return out;
	}
}

class CurrencyPriceFetcher {

	constructor(link) {
		this.link = link;
	}

	async go() {

		let driver = await CurrencyPriceFetcher.createDriver();
		try {
			await driver.get(`https://www.pathofexile.com/trade/exchange/Ritual/${this.link}`);

			await driver.wait(until.elementLocated(By.className('row exchange')), 6000);
			let exchangeEls = await driver.findElements(By.className('row exchange'));
			const firstExchangeElsCount = exchangeEls.length;

			const loadMoreButton = await driver.findElement(By.className('load-more-btn'));

			// await driver.wait(until.elementIsEnabled(loadMoreButton), 2000);
			await driver.wait(until.elementTextIs(loadMoreButton, 'Load More'), 2000);
			await loadMoreButton.click();
			await driver.wait(() => {
				return driver.findElements(By.className('row exchange')).then((elements) => {
					return elements.length !== firstExchangeElsCount;
				});
			}, 6000);

			const pageSource = await driver.getPageSource();
			const $ = cheerio.load(pageSource);

			const prices = {
				getPrices: [],
				payPrices: []
			};
			const startPrice = 18;
			const numPrices = 4;
			const rows = $('.row.exchange').slice(startPrice, startPrice + numPrices);
			rows.each((i, elem) => {
				const row = $(elem);
				const priceBlocks = row.find('.price-block');
				const getBlock = $(priceBlocks.get(0));
				const payBlock = $(priceBlocks.get(1));
				const getPrice = getBlock.find('span').last();
				const payPrice = payBlock.find('span').first();
				prices.getPrices.push(+getPrice.text());
				prices.payPrices.push(+payPrice.text());
			});

			const sumGetPrices = prices.getPrices.reduce((a, b) => a + b, 0);
			const sumPayPrices = prices.payPrices.reduce((a, b) => a + b, 0);
			const out = [
				Math.round(sumGetPrices / numPrices),
				Math.round(sumPayPrices / numPrices)
			];
			const divisible = this.gcd(...out);
			return out.map(n => n / divisible);

		} finally {
			await driver.close();
		}
	}

	gcd(a, b) {
		if (!b) {
			return a;
		}

		return this.gcd(b, a % b);
	}

	static async createDriver() {
		const chromeOptions = {
			// w3c: false,
			binary: '/Applications/Chromium.app/Contents/MacOS/Chromium',
			args: [
				"--disable-extensions",
				"--window-size=1366,768",
				"--no-sandbox",
				"--headless",
			]
		};

		const chromeCapabilities = {
			browserName: 'chrome',
			// version: 'latest',
			chromeOptions: chromeOptions
		};

		return new Builder()
			.forBrowser('chrome')
			.withCapabilities(chromeCapabilities)
			.build();
	}
}

(async () => {
	const currencyPricings = new CurrencyPricings(process.argv.slice(2));
	const pricings = await currencyPricings.start();
	console.log(pricings);
})();

