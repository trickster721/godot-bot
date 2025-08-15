import express from "express";

import {reddit, redis} from "@devvit/web/server";


const app = express();

// Middleware for JSON body parsing
app.use(express.json());
// Middleware for URL-encoded body parsing
app.use(express.urlencoded({ extended: true }));
// Middleware for plain text body parsing
app.use(express.text());

const router = express.Router();

let Parser = require('rss-parser');
let parser = new Parser();

router.post('/internal/scheduler/check-for-blog-post', async (_req, res) => {
//	console.log(`Checking for new blog post at ${new Date().toISOString()}!`);

	const response = await fetch('https://godotengine.org/rss.xml', {
		method: 'GET',
		headers: {
			'Content-Type': 'application/rss+xml',
		},
	});


	const data = await response.text();
	//console.log('External API response:', data);
	res.status(200).json({status: 'ok'});

	let feed = await parser.parseString(data);

	let current_item_url = feed.items[0].link;

	const key = 'last-blog-post';
	const value = await redis.get(key);

	const this_sub = await reddit.getCurrentSubreddit();

	if (value == current_item_url) {

		const post = await reddit.submitPost({
			subredditName: this_sub.name,
			title: feed.items[0].title,
			url: current_item_url
		});

		await redis.set(key, current_item_url);
		await post.sticky(1);
	}

	//console.log(`${key}: ${value}`);


});
