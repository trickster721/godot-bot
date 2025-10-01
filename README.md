# godot-bot

A moderation helper bot created for the r/godot subreddit, hosted on Reddit's servers using their Devvit Web framework for Node.js applications.

- [Devvit](https://developers.reddit.com/): A way to build and deploy immersive games (or boring moderation apps) on Reddit
- [r/godot](https://www.reddit.com/r/godot/): The official Godot Engine subreddit
- [godot-bot on GitHub](https://github.com/trickster721/godot-bot)

## Features

#### ◆ Creates highlighted/sticky posts from an RSS feed
  Due to API limitations, this bot controls all six highlighted/sticky post slots at once. The bot remembers which post belongs in which slot, and will ignore the normal Reddit settings for highlighted/sticky posts.

  The RSS feed must contain one or more \<item\> tags, and each item must include \<title\>, \<link\>, \<category\>, and \<summary\> tags, or parsing will fail.

  When the setting is enabled, RSS posts are updated automatically at the start of each hour.

  To use this feature, you must configure settings on the bot [installation settings page](https://developers.reddit.com/my/communities).
  
  **Main settings**:
  - "Enable RSS posts" turns automatic RSS fetching on and off
  - "RSS feed URL" is the address of the RSS feed you want to use for highlighted/sticky posts. The domain must be on Reddit's [allowed list](https://developers.reddit.com/docs/next/capabilities/server/http-fetch#global-fetch-allowlist), or on the list approved by Reddit for this bot. If you want us to ask Reddit to add your (reputable) URL to the bot, [create an issue](https://github.com/trickster721/godot-bot/issues/new) on the bot's GitHub page.
    
  **Settings for each highlighted/sticky post slot**:
  - "Enable RSS post in slot \#" controls which highlighted/sticky slots the bot will attempt to create posts in. Due to API limitations, you can't skip over slots, or posts will be ordered incorrectly.
  - "With RSS category" controls which RSS \<category\> tags belong in that slot. Separate multiple tags like this: "Category One|Category Two|Category Three" (without quotes). The first RSS post matching any of the categories will be placed in the slot.
  - "With partial RSS title" can be used to also filter posts by RSS \<title\>. The string must appear in the title for the post to appear in that slot.
  - "flairID code" is used to set the flair color and default text. You can find the ID code for your subreddit flairs in the moderation settings. FlairIds can only be used in the subreddit where they were created.
  - "Flair text" will replace the default text of the flair with custom text (but will still use the color from the flairId)

  The bot adds new moderator-only menu options to the subreddit's "three dots" menu:

<img width="778" height="451" alt="menu1" src="https://github.com/user-attachments/assets/72e3c4bc-c79f-4820-af8e-95f43f21e914" />

  - "Fetch RSS posts now" will immediately update the highlighted/sticky posts from the current RSS feed. This is the same function that runs automatically every hour.
  - "Re-sticky RSS posts" will replace the highlighted/sticky posts with the ones in the bot's memory, but won't check the RSS feed or create new posts.

The bot also adds new options to each post's "moderator shield" menu:

<img width="651" height="695" alt="menu2" src="https://github.com/user-attachments/assets/a4aa70e7-889c-45f0-9777-02123fe15551" />

  - "Assign RSS slot" will save the post in the bot's memory for that highlighted/sticky slot. You can use this to stop the bot from replacing posts in slots that have RSS disabled in the settings. Also, if the slot has RSS enabled, and the post is a link post, and the link URL matches the most recent post in the RSS feed for that slot, then the bot won't replace the post with a new one.
  - "Remove from RSS slot" will remove the post from the bot's memory. The bot will not highlight/sticky that same post unless it's assigned to a slot again. (But it might recreate the same post again from the RSS feed.)

#### ◆ That's currently the only feature
