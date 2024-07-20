// Imports and environment setup
const axios = require('axios');
require('dotenv').config();


// Constants and variables initialization
const notionToken = process.env.NOTION_TOKEN;
const databaseId = process.env.NOTION_DATABASE_ID;

// Notion API client initialization
const notion = axios.create({
  baseURL: 'https://api.notion.com/v1/',
  headers: {
    'Authorization': `Bearer ${notionToken}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  },
});

// Function to get tasks from Notion
const getTasksFromNotion = async () => {
  console.log('Getting tasks from local Notion database');
  try {
    const response = await notion.post(`databases/${databaseId}/query`);
    return response.data.results.map(task => {
      const statusProperty = task.properties.Status;
      console.log('Full Status property:', JSON.stringify(statusProperty, null, 2));
      
      const status = statusProperty.status?.name || 'Not started';
      const taskName = task.properties.Name.title[0]?.plain_text || 'Untitled';
      console.log(`Task "${taskName}" status: ${status}`);
      
      return {
        id: task.id,
        name: taskName,
        priority: task.properties.Priority.select?.name || 'No priority',
        dueDate: task.properties["Due Date"].date?.start || 'No due date',
        tags: task.properties.Tags.multi_select.map(tag => tag.name),
        pmd: task.properties.PMD.number || null,
        status: status,
      };
    });
  } catch (error) {
    console.error('Error getting tasks from local Notion database:', error.response ? error.response.data : error.message);
    throw error;
  }
};

console.log('Notion Token:', notionToken ? 'Defined' : 'Undefined');
console.log('Database ID:', databaseId ? 'Defined' : 'Undefined');

// Function to add task to Notion
const addTaskToNotion = async (task, category, pmd, priority, dueDate) => {
  console.log('Adding task to Notion:', task, 'Category:', category, 'PMD:', pmd, 'Priority:', priority, 'Due Date:', dueDate);
  try {
    const requestBody = {
      parent: { database_id: databaseId },
      properties: {
        Name: {
          title: [
            {
              text: {
                content: task,
              },
            },
          ],
        },
        Tags: {
          multi_select: category ? [{ name: category }] : [],
        },
        Priority: {
          select: priority ? { name: priority } : null,
        },
        PMD: {
          number: pmd || null,
        },
        'Due Date': {
          date: dueDate ? { start: dueDate } : null,
        },
      },
    };
    console.log('Request body:', JSON.stringify(requestBody, null, 2));
    
    const response = await notion.post('pages', requestBody);
    console.log('Response from Notion:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error adding task to Notion:', error.response ? error.response.data : error.message);
    if (error.response) {
      console.error('Error status:', error.response.status, error.response.statusText);
      console.error('Error data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
};


// Function to get database structure
const getDatabaseStructure = async () => {
  console.log('Getting DB structure from Notion');
  try {
    const response = await notion.get(`databases/${databaseId}`);
    console.log('DB structure:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('Error during getting DB structure from Notion:', error.response ? error.response.data : error.message);
    throw error;
  }
};

// Export functions
module.exports = { addTaskToNotion, getTasksFromNotion, getDatabaseStructure };
