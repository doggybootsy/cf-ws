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

export default {
	async fetch(request, env, ctx): Promise<Response> {
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
} satisfies ExportedHandler<Env>;

interface ClientData {
	name: string;
	client: WebSocket;
}

export class ChatRoom {
	private state: DurableObjectState;
	private clients: ClientData[];

	constructor(state: DurableObjectState) {
		this.state = state;
		this.clients = [];
	}

	async fetch(request: Request): Promise<Response> {
		const pair = new WebSocketPair();
		const client = pair[0];
		const server = pair[1];

		server.accept();
		const data: ClientData = { name: crypto.randomUUID(), client: server };

		this.clients.push(data);

		const refresh = () => {
			for (const ws of this.clients) {
				ws.client.send(JSON.stringify({ type: 'list', data: this.clients.map(x => x.name) }));
			}
		};

		refresh();

		server.addEventListener('message', e => {
			const rawData = e.data;

			let parsed = JSON.parse(rawData);

			if (parsed?.type === 'message') {
				const foundClient = this.clients.find(x => x.client === server);
				const messageData = {
					type: 'message',
					name: foundClient?.name || 'Anonymous',
					data: parsed.data
				};

				this.clients.forEach(ws => {
					ws.client.send(JSON.stringify(messageData));
				});
			}

			if (parsed?.type === 'change_name') {
				const foundClient = this.clients.find(x => x.client === server);
				if (foundClient) {
					foundClient.name = parsed.data;
				}

				refresh()
			}
		});

		server.addEventListener('close', () => {
			this.clients = this.clients.filter(ws => ws.client !== server);
		});

		return new Response(null, {
			status: 101,
			webSocket: client
		});
	}
}
