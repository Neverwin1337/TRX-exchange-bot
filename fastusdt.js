const tron = require('@api/tron');
const { default: axios } = require('axios');  // 用于请求价格
const sqlite3 = require('sqlite3').verbose();
const { TronWeb } = require('tronweb');

// ============== 请在此处填写你的私钥(务必妥善保管，勿将私钥泄露到公共场合) ==============
const PRIVATE_KEY = "x";

// ============== TronWeb 初始化 ==============
const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  privateKey: PRIVATE_KEY
});

// ============== 打开/初始化数据库 ==============
const db = new sqlite3.Database('./users.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite3 database.');
    // 新表 usdt_transactions
    db.run(`
      CREATE TABLE IF NOT EXISTS usdt_transactions (
        txID TEXT PRIMARY KEY,
        fromAddress TEXT,
        toAddress TEXT,
        usdtAmount TEXT,
        createTime INTEGER
      )
    `, (createErr) => {
      if (createErr) {
        console.error('创建新表 usdt_transactions 失败:', createErr.message);
      } else {
        console.log('usdt_transactions 表就绪');
      }
    });
  }
});

// ============== 目标监听地址(收 USDT 的地址) ==============
const LISTEN_ADDRESS = 'TNMqLCvzTvyHWmSwH4VtpKzsq25dQwTTRX';

// ============== USDT(Tron) 合约地址 ==============
// 常见主网 USDT-TRC20: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// ============== 获取当前时间戳用于过滤历史交易 ==============
const startTimestamp = Date.now();

// ============== 主流程：监听 USDT 交易 + 返还 TRX ==============
async function fastTrx() {
  // 改为调用 trc20TransactionInformationByAccountAddress，只获取 TRC20 USDT 的转入记录
  tron
    .trc20TransactionInformationByAccountAddress({
      address: LISTEN_ADDRESS,
      contract: USDT_CONTRACT_ADDRESS,
      only_to: 'true',
      min_timestamp: startTimestamp
    })
    .then(({ data }) => {
      // data.data 是 TRC20 交易数组
      // 数组中每一项一般包括: transaction_id, block_timestamp, from, to, value, ...
      if (!data || !data.data) {
        console.log('没有检测到新的 TRC20 交易');
        return;
      }

      data.data.forEach((tx) => {
        try {
          const txID = tx.transaction_id;
          const fromAddress = tx.from;
          const toAddress = tx.to;
          // USDT - 6位小数，value 通常是字符串形式，如 "5000000" -> 5 USDT
          const usdtAmount = parseInt(tx.value, 10) / 1e6;
          if (usdtAmount<4.9){
            return;
          }
          if (tx.type !=="Transfer"){
            return;
          }

          // 判断是否确实转入到我们的监听地址
          if (toAddress === LISTEN_ADDRESS) {
            console.log(`\n==== 检测到 USDT 转入 ====`);
            console.log(`TxID: ${txID}`);
            console.log(`From: ${fromAddress}`);
            console.log(`To:   ${toAddress}`);
            console.log(`Amount: ${usdtAmount} USDT`);

            // ============== 1. 将交易存入数据库，避免重复处理 ==============
            db.run(
              `
                INSERT INTO usdt_transactions (txID, fromAddress, toAddress, usdtAmount, createTime)
                VALUES (?, ?, ?, ?, ?)
              `,
              [txID, fromAddress, toAddress, usdtAmount.toString(), Date.now()],
              (err) => {
                if (err) {
                  // 主键冲突 -> 说明已处理过该笔交易
                  if (err.message.includes('UNIQUE constraint failed')) {
                    console.log(`TxID ${txID} 已处理过，跳过。`);
                  } else {
                    console.error(`插入交易时发生错误: ${err.message}`);
                  }
                } else {
                  console.log(`交易 ${txID} 已存入 usdt_transactions，准备返回 TRX（扣除 10% 手续费）`);

                  // ============== 2. 获取当前 TRX 价格，然后计算返还数量 ==============
                  axios
                    .get('https://min-api.cryptocompare.com/data/price?fsym=TRX&tsyms=USDT')
                    .then((response) => {
                      // 假设返回 { "USDT": 0.07864 }
                      const priceTrxInUsdt = response.data.USDT;
                      if (!priceTrxInUsdt) {
                        console.error('未能获取 TRX 价格, 无法返还。');
                        return;
                      }

                      // usdtAmount USDT -> 可兑换的 TRX 数量
                      const totalTrx = usdtAmount / priceTrxInUsdt;
                      // 收取 10% 手续费
                      const actualTrx = totalTrx * 0.9;
                      // 转成 sun (1 TRX = 1_000_000 sun)
                      const sendTrxAmount = Math.floor(actualTrx * 1_000_000);

                      console.log(`当前 TRX 价格(来自 CryptoCompare): 1 TRX ≈ ${priceTrxInUsdt} USDT`);
                      console.log(`用户汇入: ${usdtAmount} USDT => ${totalTrx.toFixed(6)} TRX`);
                      console.log(`扣除10%后，返还: ${actualTrx.toFixed(6)} TRX (=${sendTrxAmount} sun)`);

                      // ============== 3. 发送 TRX ==============
                      tronWeb.trx
                        .sendTransaction(fromAddress, sendTrxAmount)
                        .then((txResult) => {
                          console.log('返还 TRX 成功:', txResult);
                        })
                        .catch((sendErr) => {
                          console.error('返还 TRX 失败:', sendErr);
                        });
                    })
                    .catch((apiErr) => {
                      console.error('获取 TRX 价格失败:', apiErr.message);
                    });
                }
              }
            );
          }
        } catch (error) {
          console.error('处理单笔交易时异常:', error);
        }
      });
    })
    .catch((err) => console.error('获取交易信息时出错:', err));

  // 每隔 3 秒轮询一次（可根据需要进行调整）
  setTimeout(fastTrx, 3000);
}

// 启动轮询
fastTrx();
