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
			case "/ws": {
				const id = env.CHAT.idFromName("room");
				const stub = env.CHAT.get(id);
				return stub.fetch(request);
			}
			default:
				return new Response("Not Found", { status: 404 });
		}
	},
} satisfies ExportedHandler<Env>;

export class ChatRoom {
	private state: DurableObjectState;
	private clients: WebSocket[];

	constructor(state: DurableObjectState) {
		this.state = state;
		this.clients = [];
	}

	async fetch(request: Request): Promise<Response> {
		const pair = new WebSocketPair();
		const client = pair[0];
		const server = pair[1];

		server.accept();
		this.clients.push(server);

		server.addEventListener("message", e => {
			for (const ws of this.clients) {
				if (ws !== server) ws.send(e.data);
			}
		});

		server.addEventListener("close", () => {
			this.clients = this.clients.filter(ws => ws !== server);
		});

		return new Response(null, {
			status: 101,
			webSocket: client
		});
	}
}