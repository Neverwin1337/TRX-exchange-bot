const { parentPort, workerData } = require('worker_threads');
const tron = require('@api/tron');

const { amount, address, orderTime } = workerData;
const energyRentalAddress = 'TRpHt93SpifvkF66fdV9qBKjajM8ECSXGG';
async function monitor() {
  tron.transactionInformationByAccountAddress({
    only_to: 'true',
    address: energyRentalAddress
  })
    .then(({ data }) => {
      try {
        data['data'].forEach(transaction => {
          try{
            contract = transaction['raw_data']['contract'][0];

            const txTime = transaction['raw_data']['timestamp'];
            if (contract['type'] === 'TransferContract'&&contract['parameter']['value']['amount']/1e6 === amount) {
              console.log(contract);
              if (Math.abs(txTime - new Date(orderTime)) <= 5 * 60 * 1000){
                parentPort.postMessage({ success: true, txhash: transaction['txID'] });
                return;
              }

            }
          }catch (error) {
          }
        });
      } catch (error) {
      }
    })
    .catch(err => console.error(err));
    setTimeout(monitor, 3000);
}

monitor();
