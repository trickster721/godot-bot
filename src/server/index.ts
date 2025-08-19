import express from "express";
import {
	createServer,
	context,
	getServerPort,
	reddit,
//	redis,
	Post,
	settings
} from "@devvit/web/server";

const app = express();

// Middleware for JSON body parsing
app.use(express.json());
// Middleware for URL-encoded body parsing
app.use(express.urlencoded({extended: true}));
// Middleware for plain text body parsing
app.use(express.text());

const router = express.Router();

router.post("/internal/scheduler/check-for-blog-post", async (_req, res): Promise<void> => {

		console.log(`Checking for new blog post at ${new Date().toTimeString()}`);
		const {subredditName} = context;

		const response = await fetch('https://godotengine.org/rss.xml', {
			method: 'GET',
			headers: {
				'Content-Type': 'application/rss+xml',
			},
		});

		const xml_data = await response.text();

		const rss_items = Array.from(xml_data.matchAll(/(?<=<item>)(.*?)(?=<\/item>)/gs));
		if (rss_items.length > 6) {rss_items.length = 6;}
		console.log(`found ${rss_items.length} rss items`);

		const users = ["godot-bot", "GodotTeam"];

		let existing_posts: Post[] = [];

		for (let user of users)
		{
			const more_posts: Post[] = await reddit.getPostsByUser({
				username: user,
				limit: 12,
				sort: "new",
				timeframe: "all"
			}).all();

			existing_posts = existing_posts.concat(more_posts);
		}

		console.log(`found ${existing_posts.length} recent posts`);

		const post_index = {};
		let posts_to_stick: Post[] = [];

		for (let p of existing_posts)
		{
			if (p.subredditName === subredditName && !p.removed && !p.hidden)
			{
				post_index[p.url] = p;
			}
		}

		const posts_to_add = [];

		for (let i in rss_items)
		{
			const link = rss_items[i][0].match(/(?<=<link>)(.*?)(?=<\/link>)/g)[0]
			if (post_index.hasOwnProperty(link))
			{
				posts_to_stick[i] = post_index[link];
			}
			else
			{
				posts_to_add.push({
					url: link,
					title: rss_items[i][0].match(/(?<=<title>)(.*?)(?=<\/title>)/g)[0],
					summary: rss_items[i][0].match(/(?<=<summary>)(.*?)(?=<\/summary)/g)[0],
					category: rss_items[i][0].match(/(?<=<category>)(.*?)(?=<\/category>)/g)[0],
					sticky_pos: i
				});
				console.log(`found new post: ${link}`)
			}
		}

		console.log(`${posts_to_add.length} rss posts were missing`);

		for (let post of posts_to_add)
		{
			let flair_text = "";
			if (post.category === "Release" || post.category === "Pre-release") {flair_text = "official - releases";}
			else {flair_text = "official - news";}

			const flair_code = await settings.get("flair_code");

			const new_post = await reddit.submitPost({
				subredditName: subredditName,
				title: post.title,
				url: post.url,
				text: post.summary,
			//	flairId: "2863c3ce-7cb4-11f0-9fc4-3a7035d1e990", // r/godot_bot_dev
			//	flairId: "3ea7e314-e209-11ee-875d-863f4dc3d1d4", // r/godot
				flairId: flair_code,
				flairText: flair_text
			});

			posts_to_stick[post.sticky_pos] = new_post;
		}

		posts_to_stick = posts_to_stick.filter(Boolean);

		for (let post of posts_to_stick) {await post.unsticky();}

		posts_to_stick.reverse();

		console.log(`sticking ${posts_to_stick.length} posts`);

		if (posts_to_stick.length > 0)
		{
			const first = posts_to_stick.pop();
			console.log(`sticking first post: ${first.url}`);
			await first.sticky(1);
			for (let post of posts_to_stick)
				{
				console.log(`sticking post: ${post.url}`);
				await post.sticky();
				}
		}

	console.log('finished successfully!');

	res.json({
		showToast: "Done!"
	});

});

app.use(router);

const server = createServer(app);
server.on("error", (err) => console.error(`server error; ${err.stack}`));
server.listen(getServerPort());
