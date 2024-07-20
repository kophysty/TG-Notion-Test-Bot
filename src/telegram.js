require('dotenv').config();

// Imports and environment setup
const { addTaskToNotion, getTasksFromNotion, getDatabaseStructure } = require('./notion');
const TASK_CATEGORIES = ['Today', 'Work', 'Home', 'Global', 'Everyday', "Personal"];
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const rp = require('request-promise');
require('dotenv').config();
const moment = require('moment');




// Options and categories
const PRIORITY_OPTIONS = ['skip', 'Low', 'Med', 'High'];
const PMD_CATEGORIES = ['Home', 'Work', 'Global', 'Personal'];
const PMD_OPTIONS = ['skip', '1', '2', '3', '4', '6', '8', '10'];
const DATE_CATEGORIES = ['Work', 'Home'];

//Const timers
const taskTimers = {};
const waitingForPMD = new Set();
const waitingForPriority = new Set();
const waitingForDate = new Set();

// Constants and variables initialization
const NOTION_PAGE_URL = 'https://www.notion.so/web3-future/43610d53378b41af9cf8b9e3df8878a7?v=d72e546e934f4205a93735881191a067&pvs=4';

// Bot initialization
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { 
  polling: true,
  request: {
    timeout: 60000 // increase timeout to 60 seconds
  }
});



// Set up the Menu Button - with BotFather

// /struct command handler
bot.onText(/\/struct/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const structure = await getDatabaseStructure();
    const properties = structure.properties;
    let structureMessage = 'Structure of DB:\n\n';
    for (const [key, value] of Object.entries(properties)) {
      structureMessage += `${key}: ${value.type}\n`;
    }
    bot.sendMessage(chatId, structureMessage);
  } catch (error) {
    console.error('Error of getting DB structure:', error);
    bot.sendMessage(chatId, 'Cant get DB structure.');
  }
});

// /start command handler (with Reply Keyboard)
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const opts = {
    reply_markup: {
      keyboard: [
        [{ text: '/today' }, { text: '/list' }, { text: '/addtask' }, { text: '/struct' }]
      ],
      resize_keyboard: true
    }
  };
  bot.sendMessage(chatId, 'Welcome to the To-Do List Local bot!', opts);
});

// /list command handler (shows all tasks with sort)
bot.onText(/\/list/, async (msg) => {
  const chatId = msg.chat.id;
  await sendGroupedTaskList(chatId);
});

// /addtask command handler
bot.onText(/\/addtask/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Please enter your new task:');
});

// /today command handler (shows tasks with tag Today)
bot.onText(/\/today/, async (msg) => {
  const chatId = msg.chat.id;
  await sendTodayTasks(chatId);
});

// Callback query handler
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;

  if (action === 'ignore') {
    bot.answerCallbackQuery(query.id);
    return;
  }

  if (action.startsWith('select_category:')) {
    const [, task, category] = action.split(':');
    console.log(`Selected category: ${category}`);
    
    if (taskTimers[chatId]) {
      clearTimeout(taskTimers[chatId]);
      delete taskTimers[chatId];
    }
    
    if (PMD_CATEGORIES.includes(category)) {
      waitingForPMD.add(chatId);
      
      const pmdKeyboard = {
        reply_markup: {
          inline_keyboard: [
            PMD_OPTIONS.map(option => ({ text: option, callback_data: `pmd:${task}:${category}:${option}` }))
          ]
        }
      };
      
      bot.sendMessage(chatId, 'Please select the PMD value for this task:', pmdKeyboard);

      taskTimers[chatId] = setTimeout(async () => {
        if (waitingForPMD.has(chatId)) {
          waitingForPMD.delete(chatId);
          try {
            await addTaskToNotion(task, category, null, null, null);
            bot.sendMessage(chatId, `PMD selection time expired. Task "${task}" has been added to the "${category}" category with no PMD, priority, or due date.`);
            console.log(`Task added to Notion for chat ${chatId}: ${task} (category: ${category}, PMD: null, Priority: null, Due Date: null)`);
          } catch (error) {
            bot.sendMessage(chatId, `Failed to add task to Notion. Please try again later or contact the administrator.`);
            console.error(`Failed to add task to Notion for chat ${chatId}: ${error.message}`);
          }
        }
      }, 30000);
    } else if (DATE_CATEGORIES.includes(category)) {
      waitingForDate.add(chatId);
      const dateKeyboard = createDateKeyboard(task, category);
      bot.sendMessage(chatId, 'Please select a due date for this task:', dateKeyboard);
      
      taskTimers[chatId] = setTimeout(async () => {
        if (waitingForDate.has(chatId)) {
          waitingForDate.delete(chatId);
          try {
            await addTaskToNotion(task, category, null, null, null);
            bot.sendMessage(chatId, `Date selection time expired. Task "${task}" has been added to the "${category}" category without a due date.`);
            console.log(`Task added to Notion for chat ${chatId}: ${task} (category: ${category}, no due date)`);
          } catch (error) {
            bot.sendMessage(chatId, `Failed to add task to Notion. Please try again later or contact the administrator.`);
            console.error(`Failed to add task to Notion for chat ${chatId}: ${error.message}`);
          }
        }
      }, 60000);
    } else {
      try {
        await addTaskToNotion(task, category, null, null, null);
        bot.sendMessage(chatId, `Task "${task}" has been added to the "${category}" category.`);
        console.log(`Task added to Notion for chat ${chatId}: ${task} (category: ${category}, PMD: null, Priority: null, Due Date: null)`);
      } catch (error) {
        bot.sendMessage(chatId, `Failed to add task to Notion. Please try again later or contact the administrator.`);
        console.error(`Failed to add task to Notion for chat ${chatId}: ${error.message}`);
      }
    }
  } else if (action.startsWith('pmd:')) {
    const [, task, category, pmdValue] = action.split(':');
    waitingForPMD.delete(chatId);
    waitingForPriority.add(chatId);
    
    if (taskTimers[chatId]) {
      clearTimeout(taskTimers[chatId]);
      delete taskTimers[chatId];
    }
    
    let pmd = pmdValue.toLowerCase() === 'skip' ? null : parseFloat(pmdValue);
    
    const priorityKeyboard = {
      reply_markup: {
        inline_keyboard: [
          PRIORITY_OPTIONS.map(option => ({ text: option, callback_data: `priority:${task}:${category}:${pmd}:${option}` }))
        ]
      }
    };
    
    bot.sendMessage(chatId, 'Please select the priority for this task:', priorityKeyboard);

    taskTimers[chatId] = setTimeout(async () => {
      if (waitingForPriority.has(chatId)) {
        waitingForPriority.delete(chatId);
        try {
          await addTaskToNotion(task, category, pmd, null, null);
          bot.sendMessage(chatId, `Priority selection time expired. Task "${task}" has been added to the "${category}" category with PMD: ${pmd === null ? 'not set' : pmd}, default priority, and no due date.`);
          console.log(`Task added to Notion for chat ${chatId}: ${task} (category: ${category}, PMD: ${pmd}, Priority: null, Due Date: null)`);
        } catch (error) {
          bot.sendMessage(chatId, `Failed to add task to Notion. Please try again later or contact the administrator.`);
          console.error(`Failed to add task to Notion for chat ${chatId}: ${error.message}`);
        }
      }
    }, 30000);
  } else if (action.startsWith('priority:')) {
    const [, task, category, pmd, priority] = action.split(':');
    waitingForPriority.delete(chatId);
    
    if (taskTimers[chatId]) {
      clearTimeout(taskTimers[chatId]);
      delete taskTimers[chatId];
    }
    
    let finalPriority = priority.toLowerCase() === 'skip' ? null : priority;
    
    if (DATE_CATEGORIES.includes(category)) {
      waitingForDate.add(chatId);
      const dateKeyboard = createDateKeyboard(task, category, pmd, finalPriority);
      bot.sendMessage(chatId, 'Please select a due date for this task:', dateKeyboard);
      
      taskTimers[chatId] = setTimeout(async () => {
        if (waitingForDate.has(chatId)) {
          waitingForDate.delete(chatId);
          try {
            await addTaskToNotion(task, category, pmd, finalPriority, null);
            bot.sendMessage(chatId, `Date selection time expired. Task "${task}" has been added to the "${category}" category with PMD: ${pmd === null ? 'not set' : pmd}, Priority: ${finalPriority || 'not set'}, and no due date.`);
            console.log(`Task added to Notion for chat ${chatId}: ${task} (category: ${category}, PMD: ${pmd}, Priority: ${finalPriority}, Due Date: null)`);
          } catch (error) {
            bot.sendMessage(chatId, `Failed to add task to Notion. Please try again later or contact the administrator.`);
            console.error(`Failed to add task to Notion for chat ${chatId}: ${error.message}`);
          }
        }
      }, 30000);
    } else {
      try {
        console.log(`Adding task to Notion: ${task}, category: ${category}`);
        await addTaskToNotion(task, category, pmd, finalPriority, null);
        bot.sendMessage(chatId, `Task "${task}" has been added to the "${category}" category with PMD: ${pmd === null ? 'not set' : pmd} and Priority: ${finalPriority || 'not set'}.`);
        console.log(`Task added to Notion for chat ${chatId}: ${task} (category: ${category}, PMD: ${pmd}, Priority: ${finalPriority}, Due Date: null)`);
      } catch (error) {
        bot.sendMessage(chatId, `Failed to add task to Notion. Please try again later or contact the administrator.`);
        console.error(`Failed to add task to Notion for chat ${chatId}: ${error.message}`);
      }
    }
  } else if (action.startsWith('date:')) {
    const [, task, category, pmd, priority, dateString] = action.split(':');
    waitingForDate.delete(chatId);
    
    if (taskTimers[chatId]) {
      clearTimeout(taskTimers[chatId]);
      delete taskTimers[chatId];
    }
    
    let finalDate = dateString.toLowerCase() === 'skip' ? null : dateString;
    
    try {
      await addTaskToNotion(task, category, pmd === 'null' ? null : parseFloat(pmd), priority === 'null' ? null : priority, finalDate);
      bot.sendMessage(chatId, `Task "${task}" has been added to the "${category}" category with PMD: ${pmd === 'null' ? 'not set' : pmd}, Priority: ${priority === 'null' ? 'not set' : priority}, and Due Date: ${finalDate || 'not set'}.`);
      console.log(`Task added to Notion for chat ${chatId}: ${task} (category: ${category}, PMD: ${pmd}, Priority: ${priority}, Due Date: ${finalDate})`);
    } catch (error) {
      bot.sendMessage(chatId, `Failed to add task to Notion. Please try again later or contact the administrator.`);
      console.error(`Failed to add task to Notion for chat ${chatId}: ${error.message}`);
    }
  }
  
  bot.answerCallbackQuery(query.id);
});



// Handler for adding any text as a task (with Inline Keyboard for category selection)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (msg.text && !msg.text.startsWith('/') && msg.text.trim() !== '') {
    const task = msg.text;

    const opts = {
      reply_markup: {
        inline_keyboard: TASK_CATEGORIES.map(category => ([
          { text: category, callback_data: `select_category:${task}:${category}` }
        ]))
      }
    };

    bot.sendMessage(chatId, `Choose a category for the task "${task}":`, opts);

    // Set a 30-second timer
    taskTimers[chatId] = setTimeout(async () => {
      try {
        await addTaskToNotion(task, 'Today', null, null);
        bot.sendMessage(chatId, `Category selection time expired. Task "${task}" has been added with the "Today" category, no PMD, and default priority.`);
        console.log(`Task added to Notion for chat ${chatId}: ${task} (category: Today, PMD: null, Priority: null)`);
      } catch (error) {
        bot.sendMessage(chatId, `Failed to add task to Notion. Please try again later or contact the administrator.`);
        console.error(`Failed to add task to Notion for chat ${chatId}: ${error.message}`);
      }
      delete taskTimers[chatId];
    }, 30000);
  }
});

//Function for date keyboard
function createDateKeyboard(task, category, pmd = null, priority = null) {
  const startDate = moment().add(1, 'days').startOf('day');
  const endDate = moment(startDate).add(29, 'days');
  const keyboard = [
    [{ text: 'skip', callback_data: `date:${task}:${category}:${pmd}:${priority}:skip` }],
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({ text: day, callback_data: 'ignore' }))
  ];

  let currentWeek = [];

  while (startDate.isSameOrBefore(endDate)) {
    const dayOfWeek = startDate.day();
    
    // Add empty buttons for days before the start date in the first week
    if (currentWeek.length === 0 && dayOfWeek !== 1) {
      for (let i = 1; i < dayOfWeek; i++) {
        currentWeek.push({ text: ' ', callback_data: 'ignore' });
      }
    }

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const buttonText = isWeekend ? `*${startDate.format('D')}*` : startDate.format('D');
    
    currentWeek.push({
      text: buttonText,
      callback_data: `date:${task}:${category}:${pmd}:${priority}:${startDate.format('YYYY-MM-DD')}`
    });

    if (dayOfWeek === 0 || startDate.isSame(endDate)) {
      // Fill the rest of the week with empty buttons if it's the last day
      while (currentWeek.length < 7) {
        currentWeek.push({ text: ' ', callback_data: 'ignore' });
      }
      keyboard.push(currentWeek);
      currentWeek = [];
    }

    startDate.add(1, 'days');
  }

  return {
    reply_markup: {
      inline_keyboard: keyboard
    }
  };
}

// Function to send task list
async function sendTodayTasks(chatId) {
  try {
    const tasks = await getTasksFromNotion();
    // Filter tasks tagged as 'Today' and not 'done'
    const todayTasks = tasks.filter(task => task.tags.includes('Today') && task.status !== 'done');

    if (todayTasks.length === 0) {
      bot.sendMessage(chatId, 'You have no active tasks for today.');
    } else {
      let taskList = 'Your active tasks for today:\n\n';
      todayTasks.forEach((task, index) => {
        taskList += `${index + 1}. ${task.name}`;
        if (task.priority) taskList += ` [${task.priority}]`;
        taskList += '\n';
      });
      bot.sendMessage(chatId, taskList);
    }
  } catch (error) {
    console.error('Error fetching tasks from Notion:', error);
    bot.sendMessage(chatId, 'Failed to fetch tasks. Please try again later or contact the administrator.');
  }
}

// Function to sort tasks by groups
async function sendGroupedTaskList(chatId) {
  try {
    console.log('Fetching tasks from Notion...');
    const tasks = await getTasksFromNotion();
    console.log(`Fetched ${tasks.length} tasks from Notion`);
    // Filter out tasks with 'done' or 'complete' status
    const activeTasks = tasks.filter(task => 
      task.status.toLowerCase() !== 'done' && 
      task.status.toLowerCase() !== 'complete'
    );

    if (activeTasks.length === 0) {
      bot.sendMessage(chatId, 'You have no active tasks in your list.');
    } else {
      const groupTasks = (tasks) => {
        const groups = {
          'Today': [],
          'Home': [],
          'Work': [],
          'Global': [],
          'Everyday':[],
          'Personal':[],
          'Uncategorized': []
        };

        tasks.forEach(task => {
          if (task.tags.length === 0) {
            groups['Uncategorized'].push(task);
          } else {
            task.tags.forEach(tag => {
              if (groups[tag]) {
                groups[tag].push(task);
              }
            });
          }
        });

        return groups;
      };

      const groupedTasks = groupTasks(activeTasks);

      let taskList = 'Your current active tasks:\n\n';

      Object.keys(groupedTasks).forEach(category => {
        if (groupedTasks[category].length > 0) {
          taskList += `*${category}*:\n`;
          groupedTasks[category].forEach((task, index) => {
            taskList += `  - ${task.name}\n`;
          });
          taskList += '\n';
        }
      });

      bot.sendMessage(chatId, taskList, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('Error fetching tasks from Notion:', error);
    console.error('Error in sendGroupedTaskList:', error);
    bot.sendMessage(chatId, 'Failed to fetch tasks. Please try again later or contact the administrator.');
  }
  
}


// Function to send tasks with tag Today
async function sendTodayTasks(chatId) {
  try {
    const tasks = await getTasksFromNotion();
    const today = moment().startOf('day');

    // Filter tasks for Today category
    const todayTasks = tasks.filter(task => 
      task.tags.includes('Today') && task.status !== 'Done'
    );

    // Filter tasks due today from other categories
    const dueTodayTasks = tasks.filter(task => 
      !task.tags.includes('Today') && 
      task.status !== 'Done' && 
      task.dueDate && // Check if dueDate exists
      moment(task.dueDate, moment.ISO_8601, true).isValid() && // Validate date format
      moment(task.dueDate).isSame(today, 'day')
    );

    // Filter high priority tasks from other categories
    const highPriorityTasks = tasks.filter(task => 
      !task.tags.includes('Today') && 
      task.status !== 'Done' && 
      task.priority === 'High'
    );

    let taskList = '*Your tasks for Today:*\n\n';

    // Add Today tasks
    if (todayTasks.length > 0) {
      taskList += '*Today category:*\n';
      todayTasks.forEach((task, index) => {
        taskList += `${index + 1}. ${task.name}\n`;
      });
      taskList += '\n';
    }

    // Add tasks due today from other categories
    if (dueTodayTasks.length > 0) {
      taskList += '*Due today from other categories:*\n';
      dueTodayTasks.forEach((task, index) => {
        taskList += `${index + 1}. ${task.name} (${task.tags.join(', ')})\n`;
      });
      taskList += '\n';
    }

    // Add high priority tasks from other categories
    if (highPriorityTasks.length > 0) {
      taskList += '*High Priority tasks from other categories:*\n';
      highPriorityTasks.forEach((task, index) => {
        taskList += `${index + 1}. ${task.name} (${task.tags.join(', ')})\n`;
      });
    }

    if (todayTasks.length === 0 && dueTodayTasks.length === 0 && highPriorityTasks.length === 0) {
      taskList = 'You have no active tasks for today.';
    }

    bot.sendMessage(chatId, taskList, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error fetching tasks from Notion:', error);
    bot.sendMessage(chatId, 'Failed to fetch tasks. Please try again later or contact the administrator.');
  }
}

//bot reconnect
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
    if (error.code === 'EFATAL') {
      console.log('Critical error. Restarting bot in 10 seconds...');
      setTimeout(() => {
        console.log('Restarting bot...');
        bot.stopPolling().then(() => {
          bot.startPolling();
        });
      }, 10000);
    }
  });