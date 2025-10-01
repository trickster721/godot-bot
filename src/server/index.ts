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
import {UiResponse} from '@devvit/web/shared';

// router (event system) setup
const app = express();

// Middleware for JSON body parsing
app.use(express.json());
// Middleware for URL-encoded body parsing
app.use(express.urlencoded({extended: true}));
// Middleware for plain text body parsing
app.use(express.text());

const router = express.Router();

interface RSSPostSlot {
	num: number, // sticky slot number
	rss: boolean, // rss enabled in slot settings
	category: string, // list of RSS category tags seperated by |, match any exact
	title: string, // RSS title tag, match partial, ignore if empty string
	flair: string, // flairID
	flair_text: string // text to use for flair
}

interface RSSPost {
	link: string,
	title: string,
	summary: string,
	category: string
}

// database key prefix for RSS posts
const rss_save_prefix: string = "rss_post_slot_";

// check for RSS posts
// event received from scheduler or debug menu option
// router endpoints (and other settings) are configured in devvit.json
router.post("/internal/scheduler/fetch_rss_posts", async (_req, res): Promise<void> => {

	const rss_enabled = await settings.get("rss_enabled");
	if (!rss_enabled) {
		res.json({showToast: "RSS is disabled in bot settings"});
		return;
	}

	console.log(`Fetching RSS posts at ${new Date().toTimeString()}`);

	const {subredditName} = context;

	// server-side http request
	// godotengine.org domain has been manually whitelisted by Reddit for this app
	const rss_url = await settings.get("rss_url");
	const response = await fetch(rss_url, {
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

	const rss_posts: RSSPost[] = [];

	// parse all the rss posts first, makes things simpler
	// this may crash if the RSS format is invalid
	for (let item of rss_items) {
		rss_posts.push({
			link:
				item[0].match(/(?<=<link>)(.*?)(?=<\/link>)/g)[0],
			title:
				item[0].match(/(?<=<title>)(.*?)(?=<\/title>)/g)[0],
			summary:
				item[0].match(/(?<=<summary>)(.*?)(?=<\/summary)/g)[0],
			category:
				item[0].match(/(?<=<category>)(.*?)(?=<\/category>)/g)[0]
		});

	}

	const slots: RSSPostSlot[] = [];

	for (var i = 1; i < 7; i += 1) {
		const n = i.toString();
		slots.push({
			num: i,
			rss: await settings.get("use_rss_slot_" + n),
			category: await settings.get("rss_category_slot_" + n),
			title: await settings.get("rss_title_slot_" + n),
			flair: await settings.get("rss_flair_slot_" + n),
			flair_text: await settings.get("rss_flair_text_slot_" + n),
		});
	}

	for (let slot of slots) {
		if (!slot.rss) {
			console.log(`skipping slot ${slot.num}`);
			continue;
		}
		console.log(`checking rss for slot ${slot.num}`);
		// get existing saved post (if any)
		const save_key: string = rss_save_prefix + slot.num.toString();
		const saved_post_id = await redis.get(save_key);
		let post: Post | null = null;
		if (saved_post_id) {
			post = await reddit.getPostById(saved_post_id);
		}

		for (let rss_post of rss_posts) {
			// match category and title
			let categories: string[] = [];
			if (slot.category) {categories = slot.category.split("|");}
			if (categories.includes(rss_post.category) && (!slot.title || rss_post.title.search(slot.title) > -1)) {
				console.log(`found latest rss post for slot ${slot.num}: ${rss_post.link}`);
				if (!post || post.url != rss_post.link) {
					console.log(`saved post mismatch, creating new rss post for slot ${slot.num}`);
					post = await reddit.submitPost({
						subredditName: subredditName,
						title: rss_post.title,
						url: rss_post.link,
						text: rss_post.summary,
						flairId: slot.flair,
						// flair text is arbitrary, we could use all the blog categories if we wanted
						flairText: slot.flair_text
					});
				}
				break; // stop after first (most recent) matching rss post
			}
		}

		if (post) {
			// save post to slot in database
			await redis.set(save_key, post.id);
		}
	}

	sticky_rss_posts();

	console.log('finished successfully!');

	// UI response if we entered from the menu option
	res.json({
		showToast: "Done! Please Refresh the page"
	});

});

router.post("/internal/menu/sticky_rss_posts", async (_req, res): Promise<void> => {
	console.log('re-stickying RSS posts');
	sticky_rss_posts();
	console.log('finished successfully!');
	res.json({showToast: "Done! Please Refresh the page"});
});

// re-sticky saved RSS posts
async function sticky_rss_posts(): Promise<void> {

	const posts_to_stick: Post[] = [];

	for (var i = 1; i < 7; i += 1) {
		const saved_post_id = await redis.get(rss_save_prefix + i.toString());
		let post: Post | null = null;
		if (saved_post_id) {
			post = await reddit.getPostById(saved_post_id);
			await post.unsticky(); // needed to avoid error
			posts_to_stick.push(post);
		}
	}

	if (!posts_to_stick.length) {
		console.log('no saved posts to sticky!');
		return;
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
}

// menu options to save a post in a database slot
// listed on moderation menu (shield)
// posts to RSS-enabled slots should be a link with most recent URL from RSS feed
// post will be replaced next update if URL doesn't match

router.post("/internal/form/override_rss_post_submit", async (req, res: Response<UIResponse>) => {
	const slot_num = req.body.slot_number;
	const postId = req.body.post_id;
	console.log(`overriding rss slot ${slot_num} with post ${postId}`);
	const save_key: string = rss_save_prefix + slot_num.toString();
	await redis.set(save_key, postId);
	sticky_rss_posts();
	res.json({showToast: "Done! Please Refresh the page"});
});

router.post("/internal/menu/override_rss_post", async (_req, res: Response<UIResponse>) => {
	const {postId} = context;
	res.json({
		showForm: {
			name: "override_rss_post_submit",
			form: {
				title: 'Assign post to sticky slot',
				description: '(Does not override RSS settings)',
				fields: [
					{
						type: "string",
						name: "post_id",
						label: "PostId",
						defaultValue: postId,
						disabled: true
					},
					{
						type: "select",
						name: "slot_number",
						label: "Slot number",
						options: [
							{label: '1', value: 1},
							{label: '2', value: 2},
							{label: '3', value: 3},
							{label: '4', value: 4},
							{label: '5', value: 5},
							{label: '6', value: 6},
						],
					}
				],
				acceptLabel: 'Submit',
				cancelLabel: 'Cancel',
			}
		}
	});
});

router.post("/internal/menu/clear_rss_post", async (_req, res) => {
	const {postId} = context;
	console.log(`clearing post id ${postId}`)
	for (var i = 1; i < 7; i += 1) {
		const saved_post_id = await redis.get(rss_save_prefix + i.toString());
		console.log(`slot ${i} has post id ${saved_post_id}`)
		if (saved_post_id && postId == saved_post_id) {
			await redis.set(rss_save_prefix + i.toString(), "");
			sticky_rss_posts();
			res.json({showToast: "Done! Please Refresh the page"});
			return;
		}
	}
	res.json({showToast: "Post was not sticky..."});
});

app.use(router);

const server = createServer(app);
server.on("error", (err) => console.error(`server error; ${err.stack}`));
server.listen(getServerPort());
