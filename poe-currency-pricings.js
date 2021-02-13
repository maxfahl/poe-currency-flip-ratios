#!/usr/bin/env node

const yargs = require('yargs/yargs')
const {hideBin} = require('yargs/helpers')
const fs = require('fs');
const axios = require('axios');
const { performance } = require('perf_hooks');

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
		league,
		currencies,
		profit,
		startrow,
		numrows,
		debug,
		offline
	) {
		CurrencyPricings.LEAGUE = league;
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
			this.runners.push(
				new CurrencyPricingRunner(
					c,
					this.profit,
					this.startrow,
					this.numrows,
					this.priceCache[c]
				)
			)
		});

		return await this.priceNext();
	}

	async priceNext() {
		const currentRunner = this.runners[this.currentRunner];
		if (currentRunner) {
			let result;
			try {
				result = await currentRunner.go(this.currentRunner === this.runners.length - 1);
				this.retryCount = 0;
			} catch (err) {
				this.logError(err);

				if (err.message === 'request-error') {
					if (this.retryCount < 3) {
						this.retryCount++;
						console.error(`Something went wrong, trying again in 20 seconds (${this.retryCount}).`);
						return new Promise(resolve => {
							setTimeout(
								() => resolve(this.priceNext()),
								20000
							);
						});
					} else {
						console.error(`Failed 3 times in a row, skipping ${currentRunner.currency}.`);
						await fs.writeFileSync('price-cache.json', JSON.stringify(this.priceCache));
					}
				} else if (err.message !== 'no-listings') {
					console.error('An unknown error has occurred', err);
					return '';
				}
			}
			if (result) {
				this.priceCache[currentRunner.currency] = result.prices;
				this.resultInfo += `${result.info}\n`;
			}
		} else {
			await fs.writeFileSync('price-cache.json', JSON.stringify(this.priceCache));
			return this.resultInfo;
		}
		this.currentRunner++;
		return this.priceNext();
	}

	logError(err) {
		cont d = new Date();
		let msg = `${d.toLocaleDateString()} ${d.toLocaleTimeString()}\n`;
		msg += `${err.toString()}\n\n`;
		fs.appendFileSync('error.log', msg);
	}
}


class CurrencyPricingRunner {

	constructor(
		currency,
		profit,
		startrow,
		numrows,
		priceCache
	) {
		this.currency = currency;
		this.profit = profit;
		this.startrow = startrow;
		this.numrows = numrows;
		this.priceCache = priceCache;
	}

	async go(lastRun) {
		const fetchers = [
			new CurrencyPriceFetcher(this.currency, 'chaos'),
			new CurrencyPriceFetcher('chaos', this.currency, lastRun)
		];

		let prices;
		if (CurrencyPricings.OFFLINE) {
			prices = this.priceCache;
		} else {
			try {
				prices = await fetchers.reduce((promiseChain, fetcher) => {
					return promiseChain.then(chainResults =>
						fetcher.go().then(currentResult =>
							[...chainResults, currentResult]
						)
					);
				}, Promise.resolve([]));
			} catch (err) {
				throw err;
			}
		}

		let totalNumPrices = Math.min(
			prices[0].sellPrices.length,
			prices[0].buyPrices.length,
			prices[1].sellPrices.length,
			prices[1].buyPrices.length
		);
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
		for (rowNum; rowNum < currencyToChaosPrices.buyPrices.length - 1; rowNum++) {
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
			info += `\n(Could not find row pairs matching a profit of ${this.profit}%)`;

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
		const profit = Math.round((sellRatio / buyRatio - 1) * 100);

		const info = {
			sell: '',
			buy: '',
			profit: profit
		};

		const sellMaxDivisible = this.gcd(currencyToChaos.buyPrices[row], currencyToChaos.sellPrices[row]);
		info.sell = `${currencyToChaos.sellPrices[row]}/${currencyToChaos.buyPrices[row]}`
		info.sell += ` (${currencyToChaos.sellPrices[row] / sellMaxDivisible}/${currencyToChaos.buyPrices[row] / sellMaxDivisible})`;

		const buyMaxDivisible = this.gcd(chaosToCurrency.buyPrices[row], chaosToCurrency.sellPrices[row]);
		info.buy = `${chaosToCurrency.sellPrices[row]}/${chaosToCurrency.buyPrices[row]}`;
		info.buy += ` (${chaosToCurrency.sellPrices[row] / buyMaxDivisible}/${chaosToCurrency.buyPrices[row] / buyMaxDivisible})`;

		return info;
	}

	gcd(a, b) {
		if (!b)
			return a;

		return this.gcd(b, a % b);
	}
}

class CurrencyPriceFetcher {

	want;
	have;

	constructor(want, have, lastRun) {
		this.want = want;
		this.have = have;
		this.lastRun = !!lastRun;
	}

	async go() {
		console.log(`Fetching ratios for ${ this.want } > ${ this.have }.`);

		const search = {
			exchange: {
				status: {
					option: "online"
				},
				have: [this.have],
				want: [this.want]
			}
		};

		let notes;
		let rowsData;
		let lastPriceResult;
		let listingsRateLimitEnd;
		try {
			const listingsResult = await axios.post(
				`https://www.pathofexile.com/api/trade/exchange/${ CurrencyPricings.LEAGUE }`,
				search,
				{
					headers: {
						'content-type': 'application/json',
						'X-Requested-With': 'XMLHttpRequest'
					}
				}
			);
			let {data: {id, result: rows}} = listingsResult;
			if (!rows.length) {
				console.error(`No listings found for ${this.want} > ${this.have}, skipping.`);
				throw new Error('no-listings');
			}

			const limit = this.parseRateLimit(listingsResult)
			listingsRateLimitEnd = performance.now() + (limit.num === 1 ? (limit.per * 1000) : 0);

			const rowRequests = [];
			const pages = Math.min(Math.floor(rows.length / 20) + 1, 3);
			for (let i = 0; i < pages; i++) {
				let pageRows = rows.slice(i * 20, Math.min((i + 1) * 20, rows.length - 1));
				rowRequests.push(`https://www.pathofexile.com/api/trade/fetch/${pageRows.join(',')}?exchange=true&query=${id}`);
			}

			const rowResults = [];
			for (let i = 0; i < rowRequests.length; i++) {
				console.log(`Fetching page ${i + 1} of ${rowRequests.length}.`);
				let rowResult = await axios.get(rowRequests[i]);
				rowResults.push(rowResult);

				if (i === rowRequests.length - 1)
					lastPriceResult = rowResult;
				else
					await this.waitIfRateLimited(rowResult);
			}

			rowsData = rowResults.map(rr => rr.data).map(rr => rr.result).flat().filter(rr => !!rr);
			notes = rowsData.map(rd => rd.item.note).filter(n => !!n);
		} catch (err) {
			if (err.response && (err.response.status === 429 || err.response.status === 404)) {
				throw new Error('request-error');
			} else {
				throw err;
			}
		}

		const result = {
			sellPrices: [],
			buyPrices: [],
			limit: this.parseRateLimit(lastPriceResult)
		};
		const matchReg = /([0-9]+)\/?([0-9]+)?/;
		notes.forEach(n => {
			const matches = n.match(matchReg);
			if (n.indexOf('b/o') === -1 && matches) {
				if (matches[1] && matches[2]) {
					result.sellPrices.push(+matches[1]);
					result.buyPrices.push(+matches[2]);
				} else {
					const wantIsChaos = this.want === 'chaos';
					if (wantIsChaos) {
						result.sellPrices.push(1);
						result.buyPrices.push(+matches[1]);
					} else {
						result.sellPrices.push(+matches[1]);
						result.buyPrices.push(1);
					}
				}
			}
		});

		if (!this.lastRun) {
			const lastRunRateLimit = this.parseRateLimit(lastPriceResult);
			const lastRunWait = lastRunRateLimit.num === 1 ? lastRunRateLimit.per * 1000 : 0;
			const listingRateLimitMsLeft = listingsRateLimitEnd - performance.now();
			await this.sleep(Math.max(lastRunWait, listingRateLimitMsLeft));
		}

		return result;
	}

	async waitIfRateLimited(result) {
		const limit = this.parseRateLimit(result)
		if (limit.num === 1)
			await this.sleep(limit.per * 1000);
	}

	async sleep(ms) {
		if (ms > 10000 || CurrencyPricings.DEBUG)
			console.log('Rate limited longer than usual, waiting ' + Math.round(ms/1000) + ' seconds.');
		await new Promise(resolve => setTimeout(resolve, ms));
	}

	parseRateLimit(result) {
		const limits = result.headers['x-rate-limit-ip-state'].split(',');
		const baseLimit = limits[0].split(':');
		return {
			num: +baseLimit[0],
			per: +baseLimit[1],
			throttle: +baseLimit[2]
		}
	}
}

(async () => {
	let {league = 'Ritual', currencies, profit = 10, startrow = 0, numrows = 40, debug, offline} = yargs(hideBin(process.argv)).argv

	if (startrow > 0)
		startrow = startrow - 1;

	numrows = numrows - 1;

	if (!currencies) {
		console.error('No currencies defined');
		return;
	}

	const currencyPricings = new CurrencyPricings(
		league,
		currencies.split(','),
		profit,
		startrow,
		numrows,
		!!debug,
		!!offline
	);
	const pricings = await currencyPricings.start();
	await fs.writeFileSync('result.txt', pricings);
	console.log(pricings);
})();
