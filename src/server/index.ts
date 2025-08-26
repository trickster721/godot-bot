import express from "express";
import {
	createServer,
	context,
	getServerPort,
	reddit,
	redis,
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

interface StickySlot {
	num: number, // sticky slot number
	release: string, // substring in title to determine Godot version, or "" for non-release news
	blog: Boolean // check official blog, or just use saved post?
}

interface BlogPost {
	link: string,
	title: string,
	summary: string,
	category: string,
	release: Boolean
}

// database key prefix for blog posts
const blog_save_prefix: string = "blog_post_slot_";

// check for blog posts
// event received from scheduler or debug menu option
// router endpoints (and other settings) are configured in devvit.json
router.post("/internal/scheduler/check-for-blog-post", async (_req, res): Promise<void> => {

	console.log(`Checking for new blog post at ${new Date().toTimeString()}`);

	const {subredditName} = context;

	// slot config
	// todo: add client config form
	// due to API limitations:
	// - start at 1 and use consecutive slots, no skipping
	// - all slots are controlled by the bot
	const slots: StickySlot[] = [
		{
			// News slot (default)
			num: 1,
			release: "",
			blog: true
		},
		{
			// Godot 4 release slot
			num: 2,
			release: "Godot 4",
			blog: true
		},
		{
			// Godot 3 release slot
			num: 3,
			release: "Godot 3",
			blog: true
		}
	];

	// use a flair style preset from the subreddit
	// this is a per-subreddit setting on the app dev panel
	// r/godot_bot_dev blue style - "2863c3ce-7cb4-11f0-9fc4-3a7035d1e990"
	// r/godot blue style - "3ea7e314-e209-11ee-875d-863f4dc3d1d4"
	const flair_style = await settings.get("flair_code");

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
	// parse up to 12 posts (to reduce execution time)
	if (rss_items.length > 12) {
		rss_items.length = 12;
	}
	console.log(`found ${rss_items.length} rss items`);

	const blog_posts: BlogPost[] = [];

	// parse all the blog posts first, makes things simpler
	// this may crash if the RSS format is invalid
	for (let item of rss_items) {
		const category = item[0].match(/(?<=<category>)(.*?)(?=<\/category>)/g)[0];
		const release: Boolean = (category === "Release" || category === "Pre-release");
		blog_posts.push({
			link:
				item[0].match(/(?<=<link>)(.*?)(?=<\/link>)/g)[0],
			title:
				item[0].match(/(?<=<title>)(.*?)(?=<\/title>)/g)[0],
			summary:
				item[0].match(/(?<=<summary>)(.*?)(?=<\/summary)/g)[0],
			category: category,
			release: release
		});

	}

	const posts_to_stick: Post[] = [];

	for (let slot of slots) {
		console.log(`checking blog for slot ${slot.num}`);
		// get existing saved post (if any)
		const save_key: string = blog_save_prefix + slot.num.toString();
		const saved_post_id = await redis.get(save_key);
		let post: Post | null = null;
		if (saved_post_id) {
			post = await reddit.getPostById(saved_post_id);
		}
		// is this an official slot, or something else?
		if (slot.blog) {
			for (let blog_post of blog_posts) {
				// match category and Godot version (from title string)
				if ((!slot.release && !blog_post.release) || (slot.release && blog_post.release && blog_post.title.search(slot.release) > -1)) {
					console.log(`found latest blog for slot ${slot.num}: ${blog_post.link}`);
					if (!post || post.url != blog_post.link) {
						console.log(`saved post mismatch, creating new blog post for slot ${slot.num}`);
						post = await reddit.submitPost({
							subredditName: subredditName,
							title: blog_post.title,
							url: blog_post.link,
							text: blog_post.summary,
							flairId: flair_style,
							// flair text is arbitrary, we could use all the blog categories if we wanted
							flairText: blog_post.release ? "official - releases" : "official - news"
						});
					}
					break; // stop after first (most recent) matching blog
				}
			}
		}
		if (post) {
			// save post to slot in database, unsticky it, and queue to (re)sticky
			await redis.set(save_key, post.id);
			await post.unsticky(); // needed to avoid error
			posts_to_stick.push(post);
		}
	}

	// newest to oldest
	posts_to_stick.reverse();

	// re-stick posts in correct order
	// sticky(1) replaces that slot, sticky() with no args pushes... into slot 2?
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

// menu options to save a post in a database slot
// listed on moderation menu (shield)
// post should be a link with most recent URL from RSS feed
// post will be replaced next update if URL doesn't match
async function replace_blog_post(slot_num: number): Promise<void> {
	console.log(`mod action: replace blog post ${slot_num}`);
	const {postId} = context;
	const post = await reddit.getPostById(postId);
	const save_key: string = blog_save_prefix + slot_num.toString();
	await redis.set(save_key, post.id);
	console.log("finished successfully!");
}

router.post("/internal/menu/replace_blog_post_1", async (_req, res): Promise<void> => {
	replace_blog_post(1);
	res.json({showToast: "Done! Please refresh page"});
});

router.post("/internal/menu/replace_blog_post_2", async (_req, res): Promise<void> => {
	replace_blog_post(2);
	res.json({showToast: "Done! Please refresh page"});
});

router.post("/internal/menu/replace_blog_post_3", async (_req, res): Promise<void> => {
	replace_blog_post(3);
	res.json({showToast: "Done! Please refresh page"});
});

app.use(router);

const server = createServer(app);
server.on("error", (err) => console.error(`server error; ${err.stack}`));
server.listen(getServerPort());
