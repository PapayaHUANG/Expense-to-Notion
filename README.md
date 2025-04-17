# Expense to Notion

A Node.js script to import WeChat payment bills from CSV files into a Notion database.

## Prerequisites

- Node.js (v14 or higher)
- A Notion account and integration
- WeChat payment bill exported as CSV

## Setup

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory with the following variables:
   ```
   NOTION_TOKEN=your_notion_integration_token
   NOTION_DATABASE_ID=your_notion_database_id
   ```

## How to Get Notion Credentials

1. Create a new integration at https://www.notion.so/my-integrations
2. Copy the integration token and set it as `NOTION_TOKEN` in your `.env` file
3. Create a new database in Notion
4. Share the database with your integration
5. Copy the database ID from the URL (it's the part after the workspace name and before the question mark) and set it as `NOTION_DATABASE_ID` in your `.env` file

## Usage

Run the script with the path to your CSV file:

```bash
node index.js ./path/to/your/wechat-bill.csv
```

The script will:

1. Read the CSV file
2. Extract unique transaction types and payment methods
3. Update the Notion database properties if needed
4. Import all transactions into the database
5. Show a summary of successful and failed imports

## CSV File Format

The CSV file should be exported from WeChat and contain the following columns:

- Transaction Time
- Transaction Type
- Merchant
- Product
- Payment Method
- Amount
- Status
- Transaction ID

## Error Handling

The script includes error handling for:

- Invalid file paths
- Invalid date formats
- Invalid amounts
- Notion API errors

Failed imports will be logged with their specific error messages.
