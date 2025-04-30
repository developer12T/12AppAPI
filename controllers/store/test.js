// addOrderErp.post('/addOrderErp', async (req, res) => {
 
//     const sequelize = new Sequelize(process.env.databaseerp, process.env.user, process.env.password, {
//         dialect: process.env.dialact,
//         host: process.env.server,
//     });
 
//     try {
//         const token = jwt.sign(
//             { username: 'systemm3' },
//             process.env.TOKEN_KEY,
//             { expiresIn: '2h' })
 
//         const response = await axios.post(process.env.API_URL + '/zort/order/OrderManage/getOrder12TIntoM3', { token: token }, {});
 
//         for (const orderData of response.data) {
 
//             const list = orderData.item
//                 .sort((a, b) => {
//                     const regex = /^[0-9]/;
//                     const aStartsWithNumber = regex.test(a.sku);
//                     const bStartsWithNumber = regex.test(b.sku);
 
//                     if (aStartsWithNumber && !bStartsWithNumber) {
//                         return -1;
//                     } else if (!aStartsWithNumber && bStartsWithNumber) {
//                         return 1;
//                     } else {
//                         return a.sku.localeCompare(b.sku);
//                     }
//                 });
 
//             // console.log(orderData)
 
//             // const list = order.item
//             for (let i = 0; i < list.length; i++) {
//                 console.log(i);
//                 const query = `
//                     INSERT INTO [dbo].[data_order] (OAORDT,RLDT,ORNO,CUOR,OAORTP,WHLO,FACI,OAFRE1,OAOREF,OAYREF,CUNO,ADID,OBPONR,OBITNO,
//                         OBALUN,OBORQA,OBSAPR,OBDIA2,OBPIDE,OBSMCD,OARESP,CHANNEL,STATUS,INSERT_AT,UPDATE_AT)
//                     VALUES (:value1,:value2,:value3,:value4,:value5,:value6,:value7,:value8,:value9,:value10,:value11,:value12,:value13,:value14,:value15,
//                         :value16,:value17,:value18,:value19,:value20,:value21,:value22,:value23,:value24,:value25)
//                     `;
//                 var orderdatenum = parseInt(orderData.updatedatetime.replace(/-/g, ''), 10)
//                 if (!list[i].unit) {
//                     if (list[i].sku == 'ZNS1401001') {
//                         var unittext = 'JOB'
//                     } else {
//                         var unittext = 'PCS'
//                     }
 
//                 } else {
//                     if (list[i].unit === 'Free') {
//                         var unittext = 'PCS'
//                     } else {
//                         if (list[i].unit.length > 3) {
//                             var unittext = list[i].unit.slice(0, 3)
//                         } else {
//                             var unittext = list[i].unit
//                         }
//                     }
 
//                 }
 
//                 if (list[i].pricepernumber == null) {
//                     var pricenumber = 0
//                 } else {
//                     var pricenumber = list[i].pricepernumber
//                 }
//                 if (!list[i].procode) {
//                     if (list[i].procode == 'FV2F') {
//                         var pcode = list[i].procode
//                     } else {
//                         var pcode = ''
//                     }
 
//                 } else {
//                     if (list[i].procode == 'FV2F') {
//                         var pcode = list[i].procode
//                     } else {
//                         var pcode = ''
//                     }
//                 }
//                 if (list[i].productid == '8888888') {
//                     var qty = -list[i].number
//                 } else {
//                     var qty = list[i].number
//                 }
 
//                 if (list[i].discount === null || list[i].discount === '' || list[i].discount === 0 || list[i].discount === '0') {
//                     var dis2 = 0
//                 } else {
//                     var dis2 = list[i].discount
//                 }
 
//                 const replacements = {
//                     value1: orderdatenum, value11: orderData.customercode, value21: 'SA02',
//                     value2: orderdatenum, value12: '', value22: 'ONLINE',
//                     value3: orderData.cono, value13: i + 1, value23: 0,
//                     value4: orderData.inv, value14: list[i].sku, value24: currentDate,
//                     value5: '071', value15: unittext, value25: currentDate,
//                     value6: '108', value16: qty,
//                     value7: 'F10', value17: pricenumber,
//                     value8: 'YSEND', value18: dis2,
//                     value9: orderData.number, value19: pcode,
//                     value10: '', value20: '11002',
//                 }
//                 const result = await sequelize.query(query, {
//                     replacements,
//                     type: sequelize.QueryTypes.INSERT
//                 });
//             }
//         }
 
//         res.json(response.data)
//     } catch (error) {
//         console.log(error)
//         res.json('Invalid data')
//     }
// })
 
 