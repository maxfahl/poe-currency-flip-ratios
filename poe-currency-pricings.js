const { Builder, By, until } = require('selenium-webdriver');
require('selenium-webdriver/chrome');
const cheerio = require('cheerio');

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
			this.runners.push(
				new CurrencyPricingRunner(
					c,
					CurrencyPricings.CURRENCIES[c]
				)
			)
		});
		this.priceNext();
	}

	async priceNext() {
		const nextRunner = this.runners[this.currentRunner];
		if (nextRunner) {
			const info = await nextRunner.go();
			this.result += `${info}\n\n`;
		} else {
			console.log(this.result);
			return;
		}
		this.currentRunner++;
		this.priceNext();
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

		// const prices = await fetchers.reduce((promiseChain, fetcher) => {
		// 	return promiseChain.then(chainResults =>
		// 		fetcher.go().then(currentResult =>
		// 			[...chainResults, currentResult]
		// 		)
		// 	);
		// }, Promise.resolve([]));

		const prices = await Promise.all([
			fetchers[0].go(),
			fetchers[1].go(),
		]);

		let out = `${this.currency} > chaos\n`;
		out += `${prices[0][1]}/${prices[0][0]}\n`;
		out += `chaos > ${this.currency}\n`;
		out += `${prices[1][1]}/${prices[1][0]}\n`;
		out += `Profit: ${Math.round((prices[1][1] / prices[1][0]) / (prices[0][0] / prices[0][1]) * 10) / 10}%`;

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

			await driver.wait(until.elementIsEnabled(loadMoreButton), 6000);
			await driver.wait(until.elementTextIs(loadMoreButton, 'Load More'), 6000);
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
			const startPrice = 16;
			const numPrices = 8;
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
			// binary: '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
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

new CurrencyPricings(process.argv.slice(2));
