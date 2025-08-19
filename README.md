## godot-bot

A moderation helper bot for the r/godot subreddit, hosted on Reddit's servers using their Devvit Web framework for Node.js applications.

- [Devvit](https://developers.reddit.com/): A way to build and deploy ~~immersive games~~ boring moderation apps on Reddit
- [r/godot](https://www.reddit.com/r/godot/): The official Godot Engine subreddit

## Features

- Automatically links official blog posts from the [RSS feed](https://godotengine.org/rss.xml)
  
  - Once each hour (at :00), the following things happen:
  - The bot fetches the top six items from the RSS feed (Reddit has six slots for pinned posts) 
  - The moderator post history is checked for matching posts, and any missing posts are created
  - All six posts are reordered into the six pinned/sticky post slots, to match the blog (TODO: support manually pinning other posts)
  - A flair is applied to the post based on the blog category (but isn't shown on the banner due to API limitations)

- That's currently the only feature
