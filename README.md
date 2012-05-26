Saturn.io
=========

FYI, it's pretty hacky for now, but it theoretically works... or at least some features do.

Installation
------------

Install dependencies:

    $ npm install

Make a copy of the sample config:

    $ cp conf/conf.js.sample conf/conf.js

Run MongoDB server.

Run the app:

    $ node app.js

View the app in a browser [1]. Navigate to /admin/setup to begin the setup process.

* Step 1: Create a user name and password.

* Step 2: Configure Twitter App keys [2].

* Step 3: Connect your Twitter account.

* Step 4: Navigate to /dashboard and wait a moment to see if any posts appear. (Refreshing may help, but shouldn't be required)

[1] Ignore the sidebar that shows up when you're not logged in. Log in first and then use it.

[2] If you plan to use the provided Twitter API keys/tokens, you MUST use "local.saturn.io:3000" (set local.saturn.io -> 127.0.0.1 in hosts). If you [set up a new dev app on Twitter](https://dev.twitter.com/apps/), you can set the callback URL/domain to anything you want, including localhost, 127.0.0.1, etc.
