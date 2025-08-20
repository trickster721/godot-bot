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

// router (event system) setup
const app = express();

// Middleware for JSON body parsing
app.use(express.json());
// Middleware for URL-encoded body parsing
app.use(express.urlencoded({extended: true}));
// Middleware for plain text body parsing
app.use(express.text());

const router = express.Router();

// check for blog posts
// event received from scheduler or debug menu option
// router endpoints (and other settings) are configured in devvit.json
router.post("/internal/scheduler/check-for-blog-post", async (_req, res): Promise<void> => {

	console.log(`Checking for new blog post at ${new Date().toTimeString()}`);

	const {subredditName} = context;

	// server-side http request
	// godotengine.org domain has been manually whitelisted by Reddit for this app
	const response = await fetch('https://godotengine.org/rss.xml', {
		method: 'GET',
		headers: {
			'Content-Type': 'application/rss+xml',
		},
	});

	const xml_data = await response.text();

	// seperate the source XML into one string per blog item
	const rss_items = Array.from(xml_data.matchAll(/(?<=<item>)(.*?)(?=<\/item>)/gs));
	// we only have space for six sticky posts, so keep six items
	if (rss_items.length > 6) {
		rss_items.length = 6;
	}
	console.log(`found ${rss_items.length} rss items`);

	// users to be checked for existing blog posts
	const users = ["godot-bot", "GodotTeam"];

	let recent_posts: Post[] = [];

	// both accounts only make blog posts, so the 12 most recent should be fine
	for (let user of users) {
		const more_posts: Post[] = await reddit.getPostsByUser({
			username: user,
			limit: 12,
			sort: "new",
			timeframe: "all"
		}).all();

		recent_posts = recent_posts.concat(more_posts);
	}
	console.log(`found ${recent_posts.length} recent posts`);

	// build a lookup dictionary for linked url -> post object
	const posts_by_url = {};

	for (let p of recent_posts) {
		if (p.subredditName === subredditName && !p.removed && !p.hidden) {
			posts_by_url[p.url] = p;
		}
	}

	let posts_to_stick: Post[] = [];
	const posts_to_create = [];

	// check each rss blog item
	// this will crash if the RSS code is invalid
	for (let i in rss_items) {
		const link = rss_items[i][0].match(/(?<=<link>)(.*?)(?=<\/link>)/g)[0]
		// does a post with that link already exist?
		if (posts_by_url.hasOwnProperty(link)) {
			// sticky the existing post
			posts_to_stick[i] = posts_by_url[link];
		} else {
			// collect data to create missing post
			posts_to_create.push({
				url: link,
				title: rss_items[i][0].match(/(?<=<title>)(.*?)(?=<\/title>)/g)[0],
				summary: rss_items[i][0].match(/(?<=<summary>)(.*?)(?=<\/summary)/g)[0],
				category: rss_items[i][0].match(/(?<=<category>)(.*?)(?=<\/category>)/g)[0],
				sticky_pos: i
			});
			console.log(`found new post: ${link}`)
		}
	}

	console.log(`${posts_to_create.length} new posts to create`);

	// create new posts
	for (let post of posts_to_create) {

		// choose a subreddit flair based on the blog category field
		// the text is arbitrary, it doesn't need to be a real preset
		// we could add all the categories from the blog instead of using just two
		let flair_text = "";
		if (post.category === "Release" || post.category === "Pre-release") {
			flair_text = "official - releases";
		} else {
			flair_text = "official - news";
		}

		// use a flair style preset from the subreddit
		// this is a per-subreddit setting on the app dev panel
		const flair_style = await settings.get("flair_code");

		const new_post = await reddit.submitPost({
			subredditName: subredditName,
			title: post.title,
			url: post.url,
			text: post.summary,
			//	flairId: "2863c3ce-7cb4-11f0-9fc4-3a7035d1e990", // r/godot_bot_dev blue style
			//	flairId: "3ea7e314-e209-11ee-875d-863f4dc3d1d4", // r/godot blue style
			flairId: flair_style,
			flairText: flair_text
		});
		posts_to_stick[post.sticky_pos] = new_post;
	}

	// remove empty slots
	posts_to_stick = posts_to_stick.filter(Boolean);

	// unsticky existing posts to avoid an error
	for (let post of posts_to_stick) {
		await post.unsticky();
	}

	// newest to oldest
	posts_to_stick.reverse();

	console.log(`sticking ${posts_to_stick.length} posts`);

	// sticky the six most recent blog posts in order
	// sticky(x) replaces that slot, sticky() with no args pushes... into slot 2?
	if (posts_to_stick.length > 0) {
		const first = posts_to_stick.pop();
		await first.sticky(1);
		for (let post of posts_to_stick) {
			await post.sticky();
		}
	}

	console.log('finished successfully!');

	// UI response if we entered from the menu option
	res.json({
		showToast: "Done!"
	});

});

app.use(router);

const server = createServer(app);
server.on("error", (err) => console.error(`server error; ${err.stack}`));
server.listen(getServerPort());
