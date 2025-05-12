const tron = require('@api/tron');
const { default: axios } = require('axios');
const sqlite3 = require('sqlite3').verbose();
const timestamp = Date.now();
const {TronWeb} = require('tronweb');

const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
  });

const db = new sqlite3.Database('./users.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite3 database.');
    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (txID TEXT PRIMARY KEY, ownerAddress TEXT);
      )
    `);
  }
});
async function fastTrx() {
    tron.transactionInformationByAccountAddress({
        only_to: 'true',
        address: 'THsydC1w99Vr7LZzjZpYqumTeqXLgbCCCC',
        min_timestamp: timestamp
      })
        .then(({ data }) => {
          try {
            data['data'].forEach(transaction => {
              try{
                contract = transaction['raw_data']['contract'][0];
                if (contract['type'] === 'TransferContract') {
                  const amount = contract['parameter']['value']['amount'];
                  if (amount % 5000000 === 0) {
                    const multiplier = amount / 5000000;
                    console.log(`Amount is a multiple of 5000000, multiplier: ${multiplier} ${transaction['txID']}`);
                    
                    const ownerAddress = contract['parameter']['value']['owner_address'];
                    const decodedAddress = tronWeb.address.fromHex(ownerAddress);


                    db.run(`INSERT INTO transactions (txID, ownerAddress,amount) VALUES (?, ?,?)`,[transaction['txID'], decodedAddress,amount], function(err) {
                            if (err) {
                                console.error(`Failed to insert transaction ${transaction['txID']}: ${err.message}`);
                            } else {
                                console.log(`Transaction ${transaction['txID']} inserted successfully`);
                                const headers = {
                                    'User-Agent': 'weidubot_neverwin_lkj555', // 自定义 UA
                                  };
                                const params = {
                                token: 'x',
                                type: "energy",
                                count: 65000 * multiplier,
                                period: '1h',
                                address: decodedAddress,
                                };
                                axios.get('https://admin.weidubot.cc/api/trc_api/frozen_energy', { headers, params }).then(response => {
                                console.log("Response data:", response.data);
                                })
                                .catch(error => {
                                    console.error("Error:", error.response ? error.response.data : error.message);
                                });
                            }
                        });


                    console.log(`Decoded owner address: ${decodedAddress}`);
                  }
                }
              }catch (error) {
                console.error(error);
              }
            });
          } catch (error) {
          }
        })
        .catch(err => console.error(err));
        setTimeout(fastTrx, 3000);
}
fastTrx();