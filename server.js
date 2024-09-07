import "dotenv/config";
import { createClient } from "redis";
import axios from "axios";

const client = createClient({
	url: process.env.REDIS_URI,
	socket: {
		reconnectStrategy(retries) {
			if (retries > 5) {
				return new Error("Max retries reached");
			}
			return Math.min(retries * 50, 500); // Retry with exponential backoff
		},
	},
});

client.on("connect", () => {
	console.log("Connected to Redis");
});

client.on("end", () => {
	console.log("Disconnected from Redis");
});

client.on("error", (err) => {
	console.error("Redis error:", err.message);
});

(async () => {
	try {
		await client.connect();
		console.log("Waiting for messages...");

		while (true) {
			try {
				const item = await client.brPop("messages", 0);
				await new Promise((resolve) => setTimeout(resolve, 10));
				const { participants, message } = JSON.parse(item.element);
				const { data } = await axios.post(
					"http://localhost:3009/api/v1/ws-session/get-ws-sessions",
					{
						userNames: participants.filter(
							(participant) => participant != message.author,
						),
					},
				);
				await axios.post(
					"http://localhost:3008/websocket-event/message/send-message",
					{
						wsIds: data.sessions.map((session) => session.wsId),
						message,
					},
				);
			} catch (error) {
				console.error("Error processing message:", error.message);
			}
		}
	} catch (error) {
		console.error("Error connecting to Redis:", error);
	} finally {
		await client.quit();
	}
})();
