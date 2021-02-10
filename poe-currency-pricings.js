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
			// let driver = await CurrencyPriceFetcher.createDriver();
			// driver.quit(); // Close all drivers for now.
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
			// let driver = await CurrencyPriceFetcher.createDriver();
			// driver.quit(); // Close all drivers for now.
			throw new Error('Could not fetch prices, rate limit probably exceeded.');
		}

		// const prices = [{"sellPrices":[21,21,7,21,70,1115,340,48,136,68,136,170,68,680,340,68,142,270],"buyPrices":[3,3,1,3,10,160,49,7,20,10,20,25,10,100,50,10,21,40]},{"sellPrices":[13,38,5,10,10,10,20,5,5,40,60,13,50,2,2,10,10,10],"buyPrices":[93,272,36,72,72,72,144,36,36,290,435,95,370,15,15,75,75,75]}];

		let bestPrice = {
			sell: null,
			buy: null,
			profit: 0
		};

		const currencyToChaosPrices = prices[0];
		const chaosToCurrencyPrices = prices[1];
		for (let i = 0; i < currencyToChaosPrices.sellPrices.length; i++) {
			const sellRatio = currencyToChaosPrices.sellPrices[i] / currencyToChaosPrices.buyPrices[i];
			const buyRatio = chaosToCurrencyPrices.buyPrices[i] / chaosToCurrencyPrices.sellPrices[i];
			const profit = Math.round((buyRatio / sellRatio - 1) * 100);

			if (profit <= 10 /* Min profit */) {
				const sellMaxDivisible = this.gcd(currencyToChaosPrices.buyPrices[i], currencyToChaosPrices.sellPrices[i]);
				bestPrice.sell = `${ currencyToChaosPrices.buyPrices[i] }/${ currencyToChaosPrices.sellPrices[i] }`
				bestPrice.sell += ` (${ currencyToChaosPrices.buyPrices[i] / sellMaxDivisible }/${ currencyToChaosPrices.sellPrices[i] / sellMaxDivisible })`;

				const buyMaxDivisible = this.gcd(chaosToCurrencyPrices.buyPrices[i], chaosToCurrencyPrices.sellPrices[i]);
				bestPrice.buy = `${ chaosToCurrencyPrices.buyPrices[i] }/${ chaosToCurrencyPrices.sellPrices[i] }`;
				bestPrice.buy += ` (${ chaosToCurrencyPrices.buyPrices[i] / buyMaxDivisible }/${ chaosToCurrencyPrices.sellPrices[i] / buyMaxDivisible })`;

				bestPrice.profit = profit;
			} else
				break;
		}

		let out = `${this.currency} > chaos\n`;
		out += `${ bestPrice.sell }\n`;
		out += `chaos > ${this.currency}\n`;
		out += `${ bestPrice.buy }\n`;
		out += `Profit: ${ bestPrice.profit }%`;
		return out;
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

			const result = {
				sellPrices: [],
				buyPrices: []
			};
			const skipPrices = 8;
			const maxPrices = 18;
			let rows = $('.row.exchange');
			rows = rows.slice(
				skipPrices,
				maxPrices ? skipPrices + maxPrices : rows.length - 1
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

			// const sumSellPrices = prices.sellPrices.reduce((a, b) => a + b, 0);
			// const sumBuyPrices = prices.buyPrices.reduce((a, b) => a + b, 0);
			// const out = [
			// 	Math.round(sumSellPrices / numPrices),
			// 	Math.round(sumBuyPrices / numPrices)
			// ];
			// const divisible = this.gcd(...out);
			// return out.map(n => n / divisible);
			return result;

		} finally {
			await driver.close();
		}
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

