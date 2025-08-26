# godot-bot

A moderation helper bot for the r/godot subreddit, hosted on Reddit's servers using their Devvit Web framework for Node.js applications.

- [Devvit](https://developers.reddit.com/): A way to build and deploy ~~immersive games~~ boring moderation apps on Reddit
- [r/godot](https://www.reddit.com/r/godot/): The official Godot Engine subreddit

## Features

#### ◆ Mirrors official blog posts from the [RSS feed](https://godotengine.org/rss.xml)
  Blog posts are assigned a pinned/sticky/highlighted slot based on the parsed category:
  ```
  1. General News 
  2. Godot 4.X Releases
  3. Godot 3.X Releases
  ```
  Due to API limitations, the bot controls all six pinned/sticky/highlighted slots. A reference to the post used for each slot is saved in a custom database field.
  
  Once each hour (at :00), the following things happen:
  - The bot fetches the top 12 items from the RSS feed
  - The most recent blog post is identified for each configured category
  - If the saved Reddit post for a slot doesn't match the most recent blog URL, a new post is created
  - The posts are pinned into the correct sticky/highlighted slots
  - A flair is applied to the post based on the blog category (but isn't shown on the banner due to API limitations)

  TODO: Create frontend client configuration form, allowing non-RSS posts to be kept stcky (in slot 4?)

#### ◆ That's currently the only feature
