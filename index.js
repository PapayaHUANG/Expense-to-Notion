/**
 * 微信支付账单导入 Notion 数据库工具
 *
 * 这个脚本可以将微信支付导出的账单 CSV 文件导入到 Notion 数据库中。
 * 它会自动创建所需的数据库属性，并处理日期、金额等特殊格式。
 *
 * 环境要求：
 * - Node.js
 * - .env 文件中配置 NOTION_TOKEN 和 NOTION_DATABASE_ID
 *
 * 使用方法：
 * node index.js <CSV文件路径>
 * 例如：node index.js ./testbill.csv
 */

// 导入必要的依赖
const fs = require('fs');
const { Client } = require('@notionhq/client');
const path = require('path');
require('dotenv').config();

// 初始化 Notion 客户端
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DATABASE_ID;

/**
 * 从 CSV 文件中提取所有唯一的交易类型和支付方式
 * @param {string} csvContent CSV 文件内容
 * @returns {Object} 包含交易类型和支付方式的集合
 */
function extractUniqueValues(csvContent) {
	const lines = csvContent.split('\n');
	const categories = new Set();
	const paymentMethods = new Set();

	// 找到数据开始的位置
	const dataStartIndex = lines.findIndex((line) =>
		line.includes('交易时间,交易类型')
	);

	if (dataStartIndex === -1) return { categories: [], paymentMethods: [] };

	// 处理每一行数据
	for (let i = dataStartIndex + 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;

		const columns = line
			.split(',')
			.map((col) => col.trim().replace(/^"|"$/g, ''));
		const [, type, , , , , paymentMethod] = columns;

		if (type) categories.add(type);
		if (paymentMethod) paymentMethods.add(paymentMethod);
	}

	return {
		categories: Array.from(categories),
		paymentMethods: Array.from(paymentMethods),
	};
}

/**
 * 获取数据库属性配置
 * @param {Object} uniqueValues 包含交易类型和支付方式的唯一值
 * @returns {Object} 数据库属性配置
 */
function getDatabaseProperties(uniqueValues) {
	return {
		// 标题字段，用于存储商品描述
		Name: { title: {} },

		// 日期字段，用于存储交易时间
		Date: { date: {} },

		// 交易类型字段，从 CSV 中提取的可选值
		Category: {
			select: {
				options: [
					...uniqueValues.categories.map((name) => ({ name })),
					{ name: '其他' },
				],
			},
		},

		// 交易对方字段，存储为富文本
		Counterparty: { rich_text: {} },

		// 收支类型字段，预设可选值
		Type: {
			select: {
				options: [{ name: '收入' }, { name: '支出' }],
			},
		},

		// 金额字段，存储为数字
		Amount: { number: {} },

		// 支付方式字段，从 CSV 中提取的可选值
		'Payment Method': {
			select: {
				options: [
					...uniqueValues.paymentMethods.map((name) => ({ name })),
					{ name: '未知' },
				],
			},
		},
	};
}

/**
 * 更新 Notion 数据库的属性结构
 * @param {Object} properties 数据库属性配置
 * @returns {Promise<Object>} 更新后的数据库信息
 */
async function updateDatabaseProperties(properties) {
	try {
		// 获取当前数据库结构
		const database = await notion.databases.retrieve({
			database_id: databaseId,
		});
		console.log('当前数据库属性:', Object.keys(database.properties));

		// 更新数据库属性
		await notion.databases.update({
			database_id: databaseId,
			properties: properties,
		});
		console.log('✅ 数据库属性已更新');

		// 返回更新后的数据库信息
		return await notion.databases.retrieve({ database_id: databaseId });
	} catch (error) {
		console.error('更新数据库属性失败:', error);
		throw error;
	}
}

/**
 * 主函数：处理 CSV 文件并导入数据到 Notion
 * @param {string} csvPath CSV 文件路径
 */
async function main(csvPath) {
	try {
		// 验证文件路径
		if (!csvPath) {
			console.error('请提供 CSV 文件路径！');
			console.log('使用方法: node index.js <CSV文件路径>');
			process.exit(1);
		}

		// 确保文件存在
		const absolutePath = path.resolve(csvPath);
		if (!fs.existsSync(absolutePath)) {
			console.error('文件不存在:', absolutePath);
			process.exit(1);
		}

		// 读取并解析 CSV 文件
		console.log('正在读取文件:', absolutePath);
		const csvContent = fs.readFileSync(absolutePath, 'utf8');

		// 提取唯一值并更新数据库属性
		console.log('正在分析 CSV 文件中的唯一值...');
		const uniqueValues = extractUniqueValues(csvContent);
		console.log('发现的交易类型:', uniqueValues.categories);
		console.log('发现的支付方式:', uniqueValues.paymentMethods);

		// 更新数据库结构
		console.log('正在更新数据库结构...');
		const properties = getDatabaseProperties(uniqueValues);
		const database = await updateDatabaseProperties(properties);
		console.log('数据库属性已更新:', Object.keys(database.properties));

		const lines = csvContent.split('\n');

		// 查找数据开始的位置（跳过微信支付账单的表头信息）
		const dataStartIndex = lines.findIndex((line) =>
			line.includes('交易时间,交易类型')
		);
		if (dataStartIndex === -1) {
			throw new Error('找不到数据部分');
		}

		// 逐行处理数据
		let successCount = 0;
		let failureCount = 0;

		for (let i = dataStartIndex + 1; i < lines.length; i++) {
			const line = lines[i].trim();
			if (!line) continue;

			// 解析 CSV 行，处理引号和空格
			const columns = line
				.split(',')
				.map((col) => col.trim().replace(/^"|"$/g, ''));

			// 解构数据列
			const [
				dateStr, // 交易时间
				type, // 交易类型
				counterparty, // 交易对方
				description, // 商品描述
				transactionType, // 收/支
				amountStr, // 金额
				paymentMethod, // 支付方式
			] = columns;

			// 跳过无效数据行
			if (!dateStr || !amountStr) continue;

			try {
				// 解析并验证日期
				const dateValue = new Date(dateStr);
				if (isNaN(dateValue)) {
					console.error('无效的日期:', dateStr);
					failureCount++;
					continue;
				}

				// 解析并验证金额（移除货币符号和空格）
				const amount = parseFloat(amountStr.replace(/[¥\s,]/g, ''));
				if (isNaN(amount)) {
					console.error('无效的金额:', amountStr);
					failureCount++;
					continue;
				}

				// 创建 Notion 页面
				await notion.pages.create({
					parent: { database_id: databaseId },
					properties: {
						Name: {
							title: [{ text: { content: description || '(无商品名)' } }],
						},
						Date: { date: { start: dateValue.toISOString() } },
						Category: { select: { name: type || '其他' } },
						Counterparty: {
							rich_text: [{ text: { content: counterparty || '未知' } }],
						},
						Type: { select: { name: transactionType || '支出' } },
						Amount: { number: amount },
						'Payment Method': { select: { name: paymentMethod || '未知' } },
					},
				});

				console.log('✅ 已导入:', dateStr, description, amountStr);
				successCount++;
			} catch (error) {
				// 错误处理和日志记录
				console.error('❌ 导入失败:', error.message);
				console.error('失败的数据行:', line);
				if (error.body) {
					console.error('详细错误:', JSON.stringify(error.body, null, 2));
				}
				failureCount++;
			}
		}

		// 输出导入统计
		console.log('\n导入统计:');
		console.log(`✅ 成功导入: ${successCount} 条`);
		console.log(`❌ 导入失败: ${failureCount} 条`);
		console.log('🎉 处理完成！');
	} catch (error) {
		console.error('处理过程中出错:', error);
	}
}

// 从命令行参数获取 CSV 文件路径并执行主函数
const csvPath = process.argv[2];
main(csvPath);
