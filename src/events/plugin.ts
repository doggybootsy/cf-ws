import { env } from 'cloudflare:workers';

const fileName = 'hashes.json';
const DISCORD_APP = `https://canary.discord.com/app`;
const DISCORD_PATH = `https://canary.discord.com`;
const DISCORD_SCRIPTS = /script\s+\w+\s+src="(.*?)"/g;
const BUILD_NUMBER = /BUILD_NUMBER":"(\d+)/;
const BUILD_HASH = /buildId":"(\w+)/;

export async function getBuilds(page = 100, limit = 160) {
	const data = await (await fetch(`https://api.discord.sale/builds?limit=${limit}&page=${page}`, {
		'headers': {
			'accept': 'application/json, text/plain, */*',
			'accept-language': 'en-US,en;q=0.9,ja;q=0.8',
			'cache-control': 'no-cache',
			'pragma': 'no-cache',
			'priority': 'u=1, i',
			'sec-ch-ua': '"Microsoft Edge";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
			'sec-ch-ua-mobile': '?0',
			'sec-ch-ua-platform': '"Windows"',
			'sec-fetch-dest': 'empty',
			'sec-fetch-mode': 'cors',
			'sec-fetch-site': 'same-site'
		},
		'body': null,
		'method': 'GET'
	})).json();

	return data;
}

async function fetchContent(url: string = DISCORD_APP) {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const text = await response.text();
		let returnStatement;

		if (url == DISCORD_APP) {
			returnStatement = {
				content: text,
				buildNumber: BUILD_NUMBER.exec(text)?.[1],
				buildHash: BUILD_HASH.exec(text)?.[1]
			};
		} else {
			returnStatement = {
				content: text,
				discordStatus: /class="whitespace-pre-wrap actual-title with-ellipsis"\shref=".{1,3}incidents.{1,1}(.*?)"/.exec(text)?.[1]
			};
		}

		return returnStatement;
	} catch (error) {
		console.error('Failed to fetch content:', error);
		throw error;
	}
}

export async function saveBuild() {
	const timestamp = Date.now();

	const existing = await env.bucket.get(fileName);
	const builds = existing ? await existing.json() : [];

	const id = await fetchContent();

	const existingBuild = builds.find((b: any) => b.hash === id.buildHash);

	if (existingBuild) {
		return existingBuild;
	}

	const newBuild = {
		type: 'READY',
		hash: id.buildHash,
		id: id.buildNumber,
		timestamp
	};

	builds.unshift(newBuild);

	await env.bucket.put(fileName, JSON.stringify(builds, null, 0));
	return newBuild;
}

export async function getStoredBuilds() {
	const file = await env.bucket.get(fileName);

	if (!file) {
		return [];
	}

	return await file.json();
}

export async function getMostRecentBuild() {
	const builds = await getStoredBuilds();

	if (!builds || builds.length === 0) {
		return null;
	}

	return builds[0];
}
