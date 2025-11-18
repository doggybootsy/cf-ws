/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { getMostRecentBuild, getStoredBuilds, saveBuild } from './events/plugin';
import { env } from 'cloudflare:workers';

export default {
	async fetch(request): Promise<Response> {
		const url = new URL(request.url);

		switch (url.pathname) {
			case '/ws': {
				const id = env.CHAT.idFromName('room');
				const stub = env.CHAT.get(id);
				return stub.fetch(request);
			}
			default:
				return new Response('Not Found', { status: 404 });
		}
	}
} satisfies ExportedHandler;

interface ClientData {
	name?: string;
	from: 'plugin' | 'unknown';
	client: WebSocket;
}

export class Websocket {
	private state: DurableObjectState;
	private clients: ClientData[];
	private checkIntervalId?: number;

	constructor(state: DurableObjectState) {
		this.state = state;
		this.clients = [];
		this.checkIntervalId = undefined;
	}

	private startGlobalCheck() {
		if (this.checkIntervalId !== undefined) {
			return;
		}

		this.checkIntervalId = setInterval(async () => {
			const builds = await getStoredBuilds();
			const currentBuild = await getMostRecentBuild();

			if (!builds.find(x => x.hash == currentBuild.hash)) {
				const message = JSON.stringify({ type: 'new_build', data: currentBuild });

				for (const clientData of this.clients) {
					if (clientData.from === 'plugin') {
						try {
							clientData.client.send(message);
						} catch (e) {
							console.error('owo uh:', e);
						}
					}
				}
			}
		}, 1000 * 60) as unknown as number;
	}

	private stopGlobalCheck() {
		if (this.checkIntervalId !== undefined) {
			clearInterval(this.checkIntervalId);
			this.checkIntervalId = undefined;
		}
	}

	async fetch(request: Request): Promise<Response> {
		const pair = new WebSocketPair();
		const client = pair[0];
		const server = pair[1];

		const params = new URL(request.url).searchParams;
		const fromParam = params.get('from');
		const from: 'plugin' | 'unknown' = fromParam === 'plugin' ? 'plugin' : 'unknown';

		if (from == 'unknown') {
			return new Response(null, { status: 400 });
		}

		server.accept();

		if (from == 'plugin') {
			await saveBuild();
			const clientData = await getStoredBuilds();
			server.send(JSON.stringify({
				type: 'build',
				data: Object.values(clientData)[Object.values(clientData).length - 1]
			}));

			this.startGlobalCheck();
		}

		this.clients.push({ from, client: server });

		server.addEventListener('close', () => {
			this.clients = this.clients.filter(c => c.client !== server);

			const hasPluginClients = this.clients.some(c => c.from === 'plugin');
			if (!hasPluginClients) {
				this.stopGlobalCheck();
			}
		});

		server.addEventListener('error', () => {
			this.clients = this.clients.filter(c => c.client !== server);

			const hasPluginClients = this.clients.some(c => c.from === 'plugin');
			if (!hasPluginClients) {
				this.stopGlobalCheck();
			}
		});

		return new Response(null, { status: 101, webSocket: client });
	}
}
