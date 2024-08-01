# Telegram To-Do List Bot

This project is a Telegram bot that adds tasks to a Notion database.

## Project Setup

### Step 1: Clone the Repository

```bash
git clone https://github.com/kophysty/TG-Notion-Test-Bot
```

### Step 2: Install Dependencies
npm install

### Step 3: Create the .env File

Create a .env file in the root directory of the project and add the following environment variables:

NOTION_TOKEN=your_notion_integration_token
NOTION_DATABASE_ID=your_notion_database_id
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

### Step 4: Run the Server and Bot

```bash
node src/server.js
node src/telegram.js
```

### Step 5: start bot inside telegram


### Usage

Open a chat with your Telegram bot and send the command /add <your task> to add a task to Notion.

### Example Commands
/add Buy groceries
/add Complete the project report
Troubleshooting

### Common Issues
MODULE_NOT_FOUND: Ensure all dependencies are installed by running npm install.
Invalid Notion API Token: Verify that the Notion integration token is correct and has access to the specified database.
Telegram Bot Token Issues: Ensure the bot token is correct and the bot is set up properly in Telegram.
Logs and Debugging
Check the console logs for detailed error messages and debugging information. The bot and server will output important information and error details to the console.

### Contributing
Feel free to fork this repository and submit pull requests. We appreciate your contributions!

### License
This project is licensed under the MIT License - see the LICENSE file for details.

### Contact
If you have any questions or need further assistance, please open an issue in this repository or contact the repository owner.

