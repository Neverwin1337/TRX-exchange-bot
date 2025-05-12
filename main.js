const { default: axios } = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const tron = require('@api/tron');
const {
  Worker, isMainThread, parentPort, workerData
} = require('worker_threads');
const { TronWeb } = require('tronweb');
const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
});

// Replace with your bot token from BotFather
const energy_api = 'api'
const token = '7379212501:AAGnZc-_gMLLOqoQNP8kGQ4gc7X4Yp2rRDU';
const bot = new TelegramBot(token, { polling: true });

// Energy rental address
const energyRentalAddress = 'TRpHt93SpifvkF66fdV9qBKjajM8ECSXGG';

// Initialize SQLite3 database
const db = new sqlite3.Database('./users.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite3 database.');
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        payment_address TEXT
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY,
        user_id TEXT NOT NULL,
        energy_address TEXT NOT NULL,
        payment_address TEXT NOT NULL,
        amount INTEGER NOT NULL,
        order_time TEXT NOT NULL,
        expiry_time TEXT NOT NULL,
        count INTEGER NOT NULL,
        duration TEXT NOT NULL,
        Done INTEGER DEFAULT 0
      )
    `);
  }
});

// Main menu keyboard
const mainMenu = {
  reply_markup: {
    keyboard: [
      [
        { text: '快捷能量⚡️' },
      ], [
        { text: '能量租借⚡️' },
        { text: 'USDT 闪兑 TRX 🔄' }
      ], [
        { text: '联系客服 📞' } // Replace with your support bot link
      ]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

const price = {
  "1h": {
    "1": 5,
    "2": 8,
    "5": 20,
    "10": 35
  },
  "1day": {
    "5": 50,
    "10": 80,
    "50": 400,
    "100": 750
  },
  "3day": {
    "10": 200,
    "20": 300,
    "50": 900,
    "100": 1500
  }
};

// Inline keyboard for energy rental
const energyRentalKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '👇有效期1小时👇', callback_data: 'info_1h' }],
      [
        { text: '1笔', callback_data: 'rental_1_1h' },
        { text: '2笔', callback_data: 'rental_2_1h' },
        { text: '5笔', callback_data: 'rental_5_1h' },
        { text: '10笔', callback_data: 'rental_10_1h' }
      ],
      [{ text: '👇有效期1天👇', callback_data: 'info_1day' }],
      [
        { text: '5笔', callback_data: 'rental_5_1day' },
        { text: '10笔', callback_data: 'rental_10_1day' },
        { text: '50笔', callback_data: 'rental_50_1day' },
        { text: '100笔', callback_data: 'rental_100_1day' }
      ],
      [{ text: '👇有效期3天（每天笔数）👇', callback_data: 'info_3day' }],
      [
        { text: '10笔', callback_data: 'rental_10_3day' },
        { text: '20笔', callback_data: 'rental_20_3day' },
        { text: '50笔', callback_data: 'rental_50_3day' },
        { text: '100笔', callback_data: 'rental_100_3day' }
      ]
    ]
  }
};

// Start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '欢迎使用「能量租借及USDT-TRX兑换」机器人！\n请选择功能:', mainMenu);
});

// Handle /bind command
bot.onText(/\/bind (.+)/, (msg, match) => {
  const chatId = msg.from.id;
  const userId = msg.from.id.toString();
  const address = match[1].trim();

  if (!address) {
    return bot.sendMessage(chatId, '请提供有效的付款地址。例如：/bind YOUR_ADDRESS');
  }

  db.run(
    `
    INSERT INTO users (user_id, payment_address)
    VALUES (?, ?)
    ON CONFLICT(user_id)
    DO UPDATE SET payment_address=excluded.payment_address
    `,
    [userId, address],
    (err) => {
      if (err) {
        console.error('Error binding address:', err.message);
        bot.sendMessage(chatId, '绑定地址时出错,请稍后再试。');
      } else {
        bot.sendMessage(chatId, `地址绑定成功！您的地址为：${address}`);
      }
    }
  );
});

bot.onText(/联系客服 📞/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '请联系客服：@dldldl');
});

bot.onText(/USDT 闪兑 TRX 🔄/, (msg) => {
  const chatId = msg.chat.id;
  
  axios.get('https://min-api.cryptocompare.com/data/price?fsym=TRX&tsyms=USDT')
    .then(async (response) => {
      // 假设返回 { "USDT": 0.07864 }
      const priceTrxInUsdt = response.data.USDT;
      if (!priceTrxInUsdt) {
        console.error('未能获取 TRX 价格, 无法返还。');
        return;
      }
      const balance = (await tronWeb.trx.getBalance("TNMqLCvzTvyHWmSwH4VtpKzsq25dQwTTRX") )/1e6

      const rs = `*【USDT 兑 TRX】*\n` +
        `当前兑换比例 ：1 USDT \\= ${(priceTrxInUsdt *0.9).toString().replace(".","\\.")} TRX \n` +
        `当前可兑余额（库存） ：${balance.toFixed(0)}  （‼️5U起兑）            \n` +
        `\n` +
        `USDT\\-TRC20地址（建议收藏，点击地址自动复制）：\n` +
        `\`TNMqLCvzTvyHWmSwH4VtpKzsq25dQwTTRX\`\n` +
        ` \n` +
        `🆘注意事项：\n` +
        `1️⃣ 请勿使用交易所等中心化钱包进行转账，丢失不负责\n` +
        `2️⃣ 进U即兑，自动返TRX，一笔一回，通常2分钟内到账！\n` +
        `\n` +
        `🆕 【兑换至其他地址】：\n` +
        `转账时，添加转账备注（留言），仅填写目标地址， ‼️注意，非软件内部备注`

      bot.sendMessage(chatId, rs, { parse_mode: 'MarkdownV2' });
    });
  });
  
  // Handle text messages for main menu

  bot.onText(/快捷能量⚡️/, (msg) => {

    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const responseMessage = `【TRX 兑 能量】\n` +
      `转U之前先转TRX兑一笔能量,可节省 70%的 USDT\\TRC20转账损耗\n` +
      `当前可兑余额（库存）\n` +
      `兑换比例\\(能量1小时有效\\) :\n` +
      `➡️  5  TRX \\= 65000能量 \\=  1笔\n` +
      `➡️  10  TRX \\= 130000能量 \\=  2笔\n` +
      `更多笔数,以此类推\\(‼️小于202\\)\n` +
      `TRX地址\\(建议收藏,点击地址自动复制\\）：\n` +
      `\`THsydC1w99Vr7LZzjZpYqumTeqXLgbCCCC\`\n` +
      `🆘注意： \n` +
      `1️⃣‼️如果对方地址无U,转账一次则需要消耗2笔能量\n` +
      `2️⃣进TRX即兑,自动返能量,一笔一回,通常在15秒内到账\n` +
      `3️⃣请不要使用交易所等中心化钱包转账,丢失不负责\n`
    bot.sendMessage(chatId, responseMessage, { parse_mode: 'MarkdownV2' });
  });
  bot.onText(/能量租借⚡️/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    db.get(
      `SELECT payment_address FROM users WHERE user_id = ?`,
      [userId],
      (err, row) => {
        if (err) {
          console.error('Error checking address:', err.message);
          bot.sendMessage(chatId, '无法检索用户信息,请稍后再试。');
        } else if (!row || !row.payment_address) {
          bot.sendMessage(chatId, '请先输入你的付款地址');
          bot.once('message', (msg) => {

            const otherAddress = msg.text.trim();
            if (!otherAddress.startsWith("T")){
              bot.sendMessage(chatId, '无效的TRON地址，请重新尝试。');
              return;
            }
            db.run(
              `
            INSERT INTO users (user_id, payment_address)
            VALUES (?, ?)
            ON CONFLICT(user_id)
            DO UPDATE SET payment_address=excluded.payment_address
            `,
              [userId, otherAddress],
              (err) => {
                if (err) {
                  console.error('Error binding address:', err.message);
                  bot.sendMessage(chatId, '绑定地址时出错,请稍后再试。');
                } else {
                  bot.sendMessage(chatId, `地址绑定成功！您的付款地址为：${otherAddress}`);
                  bot.sendMessage(chatId, '请选择您需要的能量租借选项：', energyRentalKeyboard);
                }
              }
            );
          });
        } else {
          bot.sendMessage(chatId, '请选择您需要的能量租借选项：', energyRentalKeyboard);
        }
      }
    );
  });
  bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id.toString();
    const data = query.data;

    if (data.startsWith('rental_')) {

      // Ask if it's for self or others
      const rentalInfo = data.split('_');
      console.log(rentalInfo);
      const count = rentalInfo[1];
      const duration = rentalInfo[2];

      bot.sendMessage(chatId, '请选择租借对象：', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '为自己租借', callback_data: `self_${count}_${duration}` },
              { text: '为他人租借', callback_data: `others_${count}_${duration}` }
            ]
          ]
        }
      });
    } else if (data.startsWith('self_') || data.startsWith('others_')) {

      const parts = data.split('_');
      const type = parts[0];
      const count1 = parts[1];
      const duration = parts[2];

      bot.answerCallbackQuery(query.id, { text: '订单已生成,请确认！', show_alert: false });
      if (type === 'self') {
        // Use user's payment address
        db.get(
          `SELECT payment_address FROM users WHERE user_id = ?`,
          [userId],
          (err, row) => {
            if (err) {
              console.error('Error checking address:', err.message);
              bot.sendMessage(chatId, '无法检索用户信息,请稍后再试。');
            } else if (!row || !row.payment_address) {
              bot.sendMessage(chatId, '您尚未绑定付款地址。请使用 /bind <地址> 绑定。');
            } else {

              sendPaymentDetails(userId, row.payment_address, row.payment_address, count1, duration);
            }
          }
        );
      } else if (type === 'others') {
        db.get(
          `SELECT payment_address FROM users WHERE user_id = ?`,
          [userId],
          (err, row) => {
            if (err) {
              console.error('Error checking address:', err.message);
              bot.sendMessage(chatId, '无法检索用户信息,请稍后再试。');
            } else if (!row || !row.payment_address) {
              bot.sendMessage(chatId, '您尚未绑定付款地址。请使用 /bind <地址> 绑定。');

            } else {
              bot.sendMessage(chatId, '请输入他人的能量地址：');
              bot.answerCallbackQuery(query.id, { text: '订单已生成,请确认！', show_alert: false });
              bot.once('message', (msg) => {
                const otherAddress = msg.text.trim();

                if (!otherAddress) {
                  bot.sendMessage(chatId, '无效的地址,请重新尝试。');
                } else {
                  sendPaymentDetails(userId, row.payment_address, otherAddress, count1, duration);
                }
              });
            }

            // Ask for the other user's address

          });
      }
    }
  });

  // Function to send payment details
  function sendPaymentDetails(userId, pay_address, en_address, count, duration) {
    const currentTime = new Date();
    const expiryTime = new Date(currentTime.getTime() + 5 * 60 * 1000);

    console.log(duration, count);
    if (!price[duration] || !price[duration][count]) {
      return bot.sendMessage(userId, '无效的租借选项,请重新尝试。');
    }
    db.get(
      `SELECT COUNT(*) as orderCount FROM orders WHERE user_id = ?`,
      [userId],
      (err, row) => {
        if (err) {
          console.error('Error retrieving order count:', err.message);
          bot.sendMessage(userId, '无法检索订单数量,请稍后再试。');
        } else {
          const orderCount = row.orderCount;
          const price1 = price[duration][count] + orderCount * 0.0001;
          const formattedExpiryTime = expiryTime.toISOString().replace('T', ' ').split('.')[0];

          const responseMessage = `收款金额：\`${price1}\` TRX\n` +
            `获取能量地址：\n\`${en_address}\`\n` +
            `24小时收款trc20地址为：\n\`${energyRentalAddress}\`\n` +
            `‼️*請在5分鐘内完成轉賬*\n` +
            `‼️ *请务必核对金额无误,金额不对则无法确认*`;
          bot.sendMessage(userId, responseMessage, { parse_mode: 'MarkdownV2' });
          db.run(
            `
          INSERT INTO orders (user_id, energy_address , payment_address, amount, order_time, expiry_time,count,duration)
          VALUES (?, ?, ?,?, ?, ?,?,?)
          `,
            [userId, en_address, pay_address, price1, currentTime.toISOString(), expiryTime.toISOString(), count, duration],
            (err) => {
              if (err) {
                console.error('Error saving order:', err.message);
              }
            }
          );
          monitorPayment(userId, price1, pay_address, currentTime.toISOString(), duration, count, en_address);
        }
      }
    );
  }

  function monitorPayment(userId, amount, address, orderTime, duration, count, en_address) {
    const worker = new Worker('./payment.js', {
      workerData: { amount, address, orderTime },
    });

    worker.on('message', (msg) => {
      if (msg.success) {
        bot.sendMessage(
          userId,
          `订单 已完成付款,金额：${amount} TRX。\n交易哈希：${msg.txhash}`
        );
        const headers = {
          'User-Agent': 'weidubot_neverwin_lkj555', // 自定义 UA
        };
        const params = {
          token: 'x',
          type: "energy",
          count: 65000 * count,
          period: duration,
          address: en_address,
          trx_amount: 0.35
        };
        db.run(
          `UPDATE orders SET Done = 1 WHERE user_id = ? AND order_time = ?`,
          [userId, orderTime],
          (err) => {
            if (err) {
              console.error('Error updating order:', err.message);
            }
          }
        );
        axios.get('https://admin.weidubot.cc/api/trc_api/frozen_energy', { headers, params }).then(response => {
          console.log("Response data:", response.data);
        })
          .catch(error => {
            console.error("Error:", error.response ? error.response.data : error.message);
          });
        worker.terminate();
        return;
      }
    });

    worker.on('error', (err) => console.error(err));
    worker.on('exit', (code) => {
      if (code !== 0) console.error(`Worker exited with code ${code}`);
    });
  }