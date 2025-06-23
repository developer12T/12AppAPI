const sql = require('mssql');
const mysql = require('mysql2/promise');
require('dotenv').config()



exports.userQuery = async function (channel) {

  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    database: process.env.MS_SQL_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  };
  const hash = '$2b$10$DqTAeJ.dZ67XVLky203dn.77idSGjHqbOJ7ztOTeEpr1VeycWngua';

  await sql.connect(config);

  let result = ''
  if (channel == 'cash') {
    result = await sql.query`
SELECT
    DA.Sale_Code as saleCode,
    DA.Sale_Player as salePayer,
    DA.Col_LoginName as username,
    LEFT(DA.Col_NameTH, CHARINDEX(' ', DA.Col_NameTH + ' ') - 1) AS firstName,
    SUBSTRING(DA.Col_NameTH, CHARINDEX(' ', DA.Col_NameTH + ' ') + 1, LEN(DA.Col_NameTH)) AS surName,
    ${hash} AS password,
    'TEL' AS tel,
    DA.ZONE AS zone,
    DA.AREA AS area,
    DA.WH AS warehouse,
    'sale' AS role,
    '1' AS status,
    'https://apps.onetwotrading.co.th/images/qrcode/' + DA.AREA + '.jpg' AS qrCodeImage
FROM 
  [DATA_OMS].[dbo].[DATA_Area] AS DA
WHERE 
  DA.CHANNEL_NAME = 'Cash' AND 
  DA.Sale_Code is not NULL AND
  DA.Sale_Code != 'ว่าง'
  `
  }
  else if (channel == 'credit') {
    result = await sql.query`
SELECT
    DA.Sale_Code as saleCode,
    DA.Sale_Player as salePayer,
    DA.Col_LoginName as username,
    LEFT(DA.Col_NameTH, CHARINDEX(' ', DA.Col_NameTH + ' ') - 1) AS firstName,
    SUBSTRING(DA.Col_NameTH, CHARINDEX(' ', DA.Col_NameTH + ' ') + 1, LEN(DA.Col_NameTH)) AS surName,
    ${hash} AS password,
    'TEL' AS tel,
    DA.ZONE AS zone,
    DA.AREA AS area,
    DA.WH AS warehouse,
    'sale' AS role,
    '1' AS status,
    'http://apps.onetwotrading.co.th/images/qrcode/' + DA.AREA + '.jpg' AS qrCodeImage
FROM 
  [DATA_OMS].[dbo].[DATA_Area] AS DA 
WHERE 
  DA.CHANNEL_NAME = 'Credit' AND 
  DA.Sale_Code is not NULL AND
  DA.Sale_Code != 'ว่าง'
`
  }

  await sql.close();
  return result.recordset

}

exports.userQueryManeger = async function (channel, area) {

  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    database: process.env.MS_SQL_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  };
  const hash = '$2b$10$DqTAeJ.dZ67XVLky203dn.77idSGjHqbOJ7ztOTeEpr1VeycWngua';

  await sql.connect(config);


  let result = ''
  if (channel == 'cash') {
    result = await sql.query`
    SELECT 
     '' AS saleCode,
     '' AS salePayer,
    Col_LoginName AS username,
    LEFT(Col_Name, CHARINDEX(' ', Col_Name + ' ') - 1) AS firstName,
    SUBSTRING(Col_Name, CHARINDEX(' ', Col_Name + ' ') + 1, LEN(Col_Name)) AS surName,
    ${hash} AS password,
    '' AS tel,
     CASE
    WHEN Col_o_JobTitle IN ('Developer', 'IT Support', 'Sale_Manager') THEN 'All'
    ELSE Col_o_Address
  END AS zone ,
    '' AS area,
    '' AS warehouse,
    Col_o_JobTitle AS role,
    '1' AS status
    FROM [192.168.0.3].[AntDB].[dbo].[hs_User] AS hr
    WHERE 
      Col_o_JobTitle in ('Developer','IT Support','Sale_Manager','Supervisor','Area_Manager','IT')
    `;
  }


  else if (channel == 'cash') {

  }
  await sql.close();

  
  return result.recordset



}

exports.userQueryFilter = async function (channel, area) {

  const array = area.map(code => `'${code}'`).join(',');
  console.log(`(${array})`)
  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    database: process.env.MS_SQL_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  };
  const hash = '$2b$10$DqTAeJ.dZ67XVLky203dn.77idSGjHqbOJ7ztOTeEpr1VeycWngua';
  await sql.connect(config);

  let result = ''
  if (channel == 'cash') {
    query = `
  SELECT
    DA.Sale_Code as saleCode,
    DA.Sale_Player as salePayer,
    DA.Col_LoginName as username,
    LEFT(DA.Col_NameTH, CHARINDEX(' ', DA.Col_NameTH + ' ') - 1) AS firstName,
    SUBSTRING(DA.Col_NameTH, CHARINDEX(' ', DA.Col_NameTH + ' ') + 1, LEN(DA.Col_NameTH)) AS surName,
    '${hash}' AS password,
    'TEL' AS tel,
    DA.ZONE AS zone,
    DA.AREA AS area,
    DA.WH AS warehouse,
    'sale' AS role,
    '1' AS status,
    'http://apps.onetwotrading.co.th/images/qrcode/' + DA.AREA + '.jpg' AS qrCodeImage
  FROM 
    [DATA_OMS].[dbo].[DATA_Area] AS DA 
  WHERE 
    DA.CHANNEL_NAME = 'Cash' AND 
    DA.Sale_Code IS NOT NULL AND
    DA.AREA IN (${array})
`;
    result = await sql.query(query);
  }
  else if (channel == 'credit') {
    query = `
  SELECT
    DA.Sale_Code as saleCode,
    DA.Sale_Player as salePayer,
    DA.Col_LoginName as username,
    LEFT(DA.Col_NameTH, CHARINDEX(' ', DA.Col_NameTH + ' ') - 1) AS firstName,
    SUBSTRING(DA.Col_NameTH, CHARINDEX(' ', DA.Col_NameTH + ' ') + 1, LEN(DA.Col_NameTH)) AS surName,
    '${hash}' AS password,
    'TEL' AS tel,
    DA.ZONE AS zone,
    DA.AREA AS area,
    DA.WH AS warehouse,
    'sale' AS role,
    '1' AS status,
    'http://apps.onetwotrading.co.th/images/qrcode/' + DA.AREA + '.jpg' AS qrCodeImage
  FROM 
    [DATA_OMS].[dbo].[DATA_Area] AS DA 
  WHERE 
    DA.CHANNEL_NAME = 'Credit' AND 
    DA.Sale_Code IS NOT NULL AND
    DA.AREA IN (${array})
`;
    result = await sql.query(query);

  }
  await sql.close();
  return result.recordset

}



exports.storeQuery = async function (channel) {

  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    database: process.env.MS_SQL_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  };
  let result = ''
  await sql.connect(config);

  if (channel === 'cash') {
    result = await sql.query`
                    SELECT            
                    area,
                    saleCode,
                    TRIM(customerCode) AS customerCode,
                    customerName,
                    address,
                    subDistrict,
                    district,
                    province,
                    OKECAR AS provinceCode,
                    postCode,
                    customerTax,
                    customerTel,
                    customerMobile,
                    lat,
                    long,
                    customerShoptype,
                    enable,
                    storeAbout,
                    api_status,
                    head_no,
                    run_no,
                    store_status,
                    run_id,
                    OKCUA1,
                    OKCFC3,
                    OKCFC6,
                    OKECAR,
                    OKSDST,
                    type_name, 
                    CONVERT(date,(CONVERT(VARCHAR,OKRGDT))) AS date_create,
                    CASE WHEN OPADID = 'INVTSP' THEN 0 ELSE 1 END AS ship_default,
                    OPADID AS shippingId,
                    OPCUA1 AS ship_address,
                    OPCUA2 AS ship_subDistrict,
                    OPCUA2 AS ship_district,
                    OPCUA3 AS ship_province,
                    OPPONO AS ship_postcode,
                    OPGEOX AS ship_lat,
                    OPGEOY AS ship_long
            FROM [dbo].[data_store] a
            LEFT JOIN [192.168.2.74].[M3FDBPRD].[MVXJDTA].[OCUSMA] ON customerCode = OKCUNO COLLATE Latin1_General_BIN AND OKCONO = 410
            LEFT JOIN [192.168.2.74].[M3FDBPRD].[MVXJDTA].[OCUSAD] ON OKCUNO = OPCUNO AND OPCONO = 410
            LEFT JOIN [dbo].[data_shoptype] ON OKCFC6 = type_id COLLATE Thai_CI_AS
            WHERE store_status <> '90' 
  `;
  }
  else if (channel === 'credit') {
    result = await sql.query`
                    SELECT 
                    area,
                    saleCode,
                    TRIM(customerCode) AS customerCode,
                    customerName,
                    address,
                    subDistrict,
                    district,
                    province,
                    OKECAR AS provinceCode,
                    postCode,
                    customerTax,
                    customerTel,
                    customerMobile,
                    OKCUA1,
                    OKCFC3,
                    OKCFC6,
                    OKECAR,
                    OKSDST,
                    type_name, 
                    CONVERT(date,(CONVERT(VARCHAR,OKRGDT))) AS date_create,
                    CASE WHEN OPADID = 'INVTSP' THEN 0 ELSE 1 END AS ship_default,
                    OPADID AS shippingId,
                    OPCUA1 AS ship_address,
                    OPCUA2 AS ship_subDistrict,
                    OPCUA2 AS ship_district,
                    OPCUA3 AS ship_province,
                    OPPONO AS ship_postcode,
                    OPGEOX AS ship_lat,
                    OPGEOY AS ship_long
            FROM [dbo].[store_credit] a
            LEFT JOIN [192.168.2.74].[M3FDBPRD].[MVXJDTA].[OCUSMA] ON customerCode = OKCUNO COLLATE Latin1_General_BIN AND OKCONO = 410
            LEFT JOIN [192.168.2.74].[M3FDBPRD].[MVXJDTA].[OCUSAD] ON OKCUNO = OPCUNO AND OPCONO = 410
            LEFT JOIN [dbo].[data_shoptype] ON OKCFC6 = type_id COLLATE Thai_CI_AS
  `;
  }
  await sql.close();



  const return_arr = [];
  for (const row of result.recordset) {
    // console.log(row)
    const storeId = row.customerCode?.trim();
    const name = row.customerName || ''.trim();
    const taxId = row.customerTax?.trim();
    const tel = row.customerTel?.trim();
    const route = row.OKCFC3?.trim();
    const type = row.OKCFC6?.trim();
    const typeName = row.type_name || ''.trim();
    const address = row.address || ''.trim();
    const subDistrict = row.subDistrict || ''.trim();
    const district = row.district || ''.trim();
    const province = row.province || ''.trim();
    const provinceCode = row.provinceCode || ''.trim();
    const postCode = row.postCode?.trim();
    const zone = row.OKSDST?.trim();
    const area = row.area?.trim();
    const latitude = row.lat?.trim();
    const longtitude = row.long?.trim();
    const createdAt = row.date_create ? String(row.date_create).trim() : '';

    const defaultShipping = String(row.ship_default)?.trim();
    const shippingId = String(row.shippingId)?.trim();
    const ship_address = row.ship_address || ''.trim();
    const ship_subDistrict = row.ship_subDistrict || ''.trim();
    const ship_district = row.ship_district || ''.trim();
    const ship_province = row.ship_province || ''.trim();
    const ship_postCode = row.ship_postcode?.trim();
    const ship_latitude = String(row.ship_lat ?? '').trim();
    const ship_longtitude = String(row.ship_long ?? '').trim();

    const shippingAddress = {
      default: defaultShipping,
      shippingId,
      address: ship_address,
      subDistrict: ship_subDistrict,
      district: ship_district,
      province: ship_province,
      postCode: ship_postCode,
      latitude: ship_latitude,
      longtitude: ship_longtitude,
    };

    const existingStore = return_arr.find(store => store.storeId === storeId);

    if (existingStore) {
      existingStore.shippingAddress.push(shippingAddress);
    } else {
      return_arr.push({
        storeId,
        name,
        taxId,
        tel,
        route,
        type,
        typeName,
        address,
        subDistrict,
        district,
        province,
        provinceCode,
        zone,
        area,
        latitude,
        longtitude,
        createdAt,
        shippingAddress: [shippingAddress],
      });
    }
  }

  const data = []

  for (const splitData of return_arr) {
    const approveData = {
      dateSend: new Date(),
      dateAction: new Date(),
      appPerson: 'system'
    }
    const poliAgree = {
      status: 'Agree',
      date: new Date()
    }
    mainData = {
      storeId: splitData.storeId,
      name: splitData.name,
      taxId: splitData.taxId,
      tel: splitData.tel,
      route: splitData.route,
      type: splitData.type,
      typeName: splitData.typeName,
      address: splitData.address,
      district: splitData.district,
      subDistrict: splitData.subDistrict,
      province: splitData.province,
      provinceCode: splitData.provinceCode,
      'postCode ': splitData.postCode,
      zone: splitData.zone,
      area: splitData.area,
      latitude: splitData.latitude,
      longtitude: splitData.longtitude,
      lineId: '',
      'note ': '',
      approve: approveData,
      status: '20',
      policyConsent: poliAgree,
      imageList: [],
      shippingAddress: splitData.shippingAddress,
      checkIn: {},
      createdAt: splitData.createdAt,
      updatedDate: Date()
    },
      data.push(mainData)
  }



  return data
}

exports.storeQueryFilter = async function (channel, storeId) {
  const array = storeId.map(code => `'${code}'`).join(',');

  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    database: process.env.MS_SQL_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  };
  let result = ''
  await sql.connect(config);

  if (channel === 'cash') {
    query = `
                    SELECT            
                    area,
                    saleCode,
                    TRIM(customerCode) AS customerCode,
                    customerName,
                    address,
                    subDistrict,
                    district,
                    province,
                    OKECAR AS provinceCode,
                    postCode,
                    customerTax,
                    customerTel,
                    customerMobile,
                    lat,
                    long,
                    customerShoptype,
                    enable,
                    storeAbout,
                    api_status,
                    head_no,
                    run_no,
                    store_status,
                    run_id,
                    OKCUA1,
                    OKCFC3,
                    OKCFC6,
                    OKECAR,
                    OKSDST,
                    type_name, 
                    CONVERT(date,(CONVERT(VARCHAR,OKRGDT))) AS date_create,
                    CASE WHEN OPADID = 'INVTSP' THEN 0 ELSE 1 END AS ship_default,
                    OPADID AS shippingId,
                    OPCUA1 AS ship_address,
                    OPCUA2 AS ship_subDistrict,
                    OPCUA2 AS ship_district,
                    OPCUA3 AS ship_province,
                    OPPONO AS ship_postcode,
                    OPGEOX AS ship_lat,
                    OPGEOY AS ship_long
            FROM [dbo].[data_store] a
            LEFT JOIN [192.168.2.74].[M3FDBPRD].[MVXJDTA].[OCUSMA] ON customerCode = OKCUNO COLLATE Latin1_General_BIN AND OKCONO = 410
            LEFT JOIN [192.168.2.74].[M3FDBPRD].[MVXJDTA].[OCUSAD] ON OKCUNO = OPCUNO AND OPCONO = 410
            LEFT JOIN [dbo].[data_shoptype] ON OKCFC6 = type_id COLLATE Thai_CI_AS
            WHERE store_status <> '90' AND customerCode in (${array})
  `;
    result = await sql.query(query);

  }
  else if (channel === 'credit') {
    query = `
                    SELECT 
                    area,
                    saleCode,
                    TRIM(customerCode) AS customerCode,
                    customerName,
                    address,
                    subDistrict,
                    district,
                    province,
                    OKECAR AS provinceCode,
                    postCode,
                    customerTax,
                    customerTel,
                    customerMobile,
                    OKCUA1,
                    OKCFC3,
                    OKCFC6,
                    OKECAR,
                    OKSDST,
                    type_name, 
                    CONVERT(date,(CONVERT(VARCHAR,OKRGDT))) AS date_create,
                    CASE WHEN OPADID = 'INVTSP' THEN 0 ELSE 1 END AS ship_default,
                    OPADID AS shippingId,
                    OPCUA1 AS ship_address,
                    OPCUA2 AS ship_subDistrict,
                    OPCUA2 AS ship_district,
                    OPCUA3 AS ship_province,
                    OPPONO AS ship_postcode,
                    OPGEOX AS ship_lat,
                    OPGEOY AS ship_long
            FROM [dbo].[store_credit] a
            LEFT JOIN [192.168.2.74].[M3FDBPRD].[MVXJDTA].[OCUSMA] ON customerCode = OKCUNO COLLATE Latin1_General_BIN AND OKCONO = 410
            LEFT JOIN [192.168.2.74].[M3FDBPRD].[MVXJDTA].[OCUSAD] ON OKCUNO = OPCUNO AND OPCONO = 410
            LEFT JOIN [dbo].[data_shoptype] ON OKCFC6 = type_id COLLATE Thai_CI_AS
            where  customerCode in (${array})
  `;
    result = await sql.query(query);
  }
  await sql.close();
  const return_arr = [];
  for (const row of result.recordset) {
    // console.log(row)
    const storeId = row.customerCode?.trim();
    const name = row.customerName || ''.trim();
    const taxId = row.customerTax?.trim();
    const tel = row.customerTel?.trim();
    const route = row.OKCFC3?.trim();
    const type = row.OKCFC6?.trim();
    const typeName = row.type_name || ''.trim();
    const address = row.address || ''.trim();
    const subDistrict = row.subDistrict || ''.trim();
    const district = row.district || ''.trim();
    const province = row.province || ''.trim();
    const provinceCode = row.provinceCode || ''.trim();
    const postCode = row.postCode?.trim();
    const zone = row.OKSDST?.trim();
    const area = row.area?.trim();
    const latitude = row.lat?.trim();
    const longtitude = row.long?.trim();
    const createdAt = row.date_create ? String(row.date_create).trim() : '';

    const defaultShipping = String(row.ship_default)?.trim();
    const shippingId = String(row.shippingId)?.trim();
    const ship_address = row.ship_address || ''.trim();
    const ship_subDistrict = row.ship_subDistrict || ''.trim();
    const ship_district = row.ship_district || ''.trim();
    const ship_province = row.ship_province || ''.trim();
    const ship_postCode = row.ship_postcode?.trim();
    const ship_latitude = String(row.ship_lat ?? '').trim();
    const ship_longtitude = String(row.ship_long ?? '').trim();

    const shippingAddress = {
      default: defaultShipping,
      shippingId,
      address: ship_address,
      subDistrict: ship_subDistrict,
      district: ship_district,
      province: ship_province,
      postCode: ship_postCode,
      latitude: ship_latitude,
      longtitude: ship_longtitude,
    };

    const existingStore = return_arr.find(store => store.storeId === storeId);

    if (existingStore) {
      existingStore.shippingAddress.push(shippingAddress);
    } else {
      return_arr.push({
        storeId,
        name,
        taxId,
        tel,
        route,
        type,
        typeName,
        address,
        subDistrict,
        district,
        province,
        provinceCode,
        zone,
        area,
        latitude,
        longtitude,
        createdAt,
        shippingAddress: [shippingAddress],
      });
    }
  }

  const data = []

  for (const splitData of return_arr) {
    const approveData = {
      dateSend: new Date(),
      dateAction: new Date(),
      appPerson: 'system'
    }
    const poliAgree = {
      status: 'Agree',
      date: new Date()
    }
    mainData = {
      storeId: splitData.storeId,
      name: splitData.name,
      taxId: splitData.taxId,
      tel: splitData.tel,
      route: splitData.route,
      type: splitData.type,
      typeName: splitData.typeName,
      address: splitData.address,
      district: splitData.district,
      subDistrict: splitData.subDistrict,
      province: splitData.province,
      provinceCode: splitData.provinceCode,
      'postCode ': splitData.postCode,
      zone: splitData.zone,
      area: splitData.area,
      latitude: splitData.latitude,
      longtitude: splitData.longtitude,
      lineId: '',
      'note ': '',
      approve: approveData,
      status: '20',
      policyConsent: poliAgree,
      imageList: [],
      shippingAddress: splitData.shippingAddress,
      checkIn: {},
      createdAt: splitData.createdAt,
      updatedDate: Date()
    },
      data.push(mainData)
  }



  return data
}






exports.productQuery = async function (channel) {

  const config = {
    host: process.env.MY_SQL_SERVER,
    user: process.env.MY_SQL_USER,
    password: process.env.MY_SQL_PASSWORD,
    database: process.env.MY_SQL_DATABASE,
  };

  const connection = await mysql.createConnection(config);

  let result = ''
  if (channel === 'cash') {
    [result] = await connection.execute(`
SELECT 
ITNO AS id,
NAME_BILL as name,
GRP as GRP_CODE,
-- g.GRP_DESC as \`group\`,
gp.GRP_DESC as \`group\`,
GREPORT AS groupCodeM3,
gM3.GRP_DESC AS groupM3,
Brand as BRAND_CODE,
BRAND_DESC as brand,
WEIGHT AS size,
FLAVOUR as FLAVOUR_CODE,
FAV_DESC as flavour,
case 
when IS_OPEN = 'Y' then "ไม่แถม"
when IS_OPEN = 'N' then "แถม"
WHEN LEFT(ITNO, 2) = '60' THEN 'พรีเมียม'
END AS type ,
CTN_Gross,
CTN_Net,
IS_OPEN as statusSale,
IS_OPEN3 as statusRefund,
IS_OPEN4 as statusRefundDamage,
IS_OPEN5 as statusWithdraw,
unit_cal as unit ,
UNIT_CODE as nameEng,
UNIT_DESC as nameThai,
price as pricePerUnitSale ,
price3 as pricePerUnitRefund ,
price3 as pricePerUnitRefundDamage ,
price5 as pricePerUnitChange 

from m_product a
LEFT JOIN c_group g ON a.GRP = g.GRP_CODE
LEFT JOIN item_group_report gM3 ON a.GREPORT = gM3.GRP_CODE
LEFT JOIN m_unit u ON a.unit_cal = u.UNIT_CODE_BC
LEFT JOIN ca_factor c ON a.ITNO = c.itemcode 
LEFT JOIN m_flavour f ON a.FLAVOUR = f.FAV_CODE 
LEFT JOIN c_brand b ON a.Brand = b.BRAND_CODE
LEFT JOIN m_prd_group gp ON a.GRP = gp.GRP_CODE


`);

  }
  if (channel === 'credit') {
    [result] = await connection.execute(`
  SELECT 
    CP.ITNO as id,
    CP.NAME_BILL as name,
    CP.GRP as GRP_CODE,
    CG.GRP_DESC AS \`group\`,
    CP.BRAND AS BRAND_CODE,
    CB.BRAND_DESC AS brand,
    CP.WEIGHT AS size,
    CP.FLAVOUR AS FLAVOUR_CODE,
    CF.FAV_DESC as flavour,
    '' as type,
    CFA.CTN_Gross,
    CFA.CTN_Net,
    'Y' as statusSale,
    'Y' as statusWithdraw,
    'Y' as statusRefund,
    CU.UNIT_CODE_BC AS unit,  
    CP.UNIT  as nameEng,
    CU.UNIT_DESC as nameThai,
    CP.PRICE AS pricePerUnitSale,
    CP.PRICE AS pricePerUnitRefund,
    CP.PRICE AS pricePerUnitChange
  FROM c_product as CP
  JOIN (
    SELECT UNIT_CODE, UNIT_DESC, UNIT_CODE_BC
    FROM c_unit
    WHERE UNIT_DESC IN ('ผืน', 'ชุด', 'หีบ')
  ) AS CU ON CP.UNIT = CU.UNIT_CODE
  LEFT JOIN ca_factor CFA ON CP.ITNO = CFA.itemcode
  LEFT JOIN c_flavour CF ON CP.FLAVOUR = CF.FAV_CODE
  LEFT JOIN c_group CG ON CP.GRP = CG.GRP_CODE
  LEFT JOIN c_brand CB ON CP.brand = CB.BRAND_CODE
  WHERE CP.UNIT = 'CTN' OR CP.NAME_STD LIKE '%ผ้า%'
`);
  }


  const returnArr = [];

  for (const row of result) {
    // console.log(row)
    const id = String(row.id).trim();
    const unitId = parseInt(row.unit);
    const unit = row.nameEng?.trim() || '';
    const name = row.nameThai?.trim() || '';
    const priceSale = row.pricePerUnitSale;
    const priceRefund = row.pricePerUnitRefund;
    const priceRefundDmg = row.pricePerUnitRefundDamage;
    const priceChange = row.pricePerUnitChange;

    const existingItem = returnArr.find(item => item.id === id);

    const unitData = {
      id: unitId,
      unit: unit,
      name: name,
      pricePerUnitSale: priceSale,
      pricePerUnitRefund: priceRefund,
      pricePerUnitRefundDamage: priceRefundDmg,
      pricePerUnitChange: priceChange,
    };
    // console.log(unitData)
    if (existingItem) {
      existingItem.unitList.push(unitData);
    } else {
      const newItem = {
        id: id,
        name: row.name?.trim() || '',
        groupCode: row.GRP_CODE?.trim() || '',
        group: row.group?.trim() || '',
        groupCodeM3 : row.groupCodeM3?.trim() || '',
        groupM3 : row.groupM3?.trim() || '',
        brandCode: row.BRAND_CODE?.trim() || '',
        brand: row.brand?.trim() || '',
        size: row.size?.trim() || '',
        flavourCode: row.FLAVOUR_CODE?.trim() || '',
        flavour: row.flavour?.trim() || '',
        type: row.type?.trim() || '',
        weightGross: row.CTN_Gross?.toString().trim() || 0,
        weightNet: row.CTN_Net?.toString().trim() || 0,
        statusSale: row.statusSale?.trim() || '',
        statusRefund: row.statusRefund?.trim() || '',
        statusRefundDamage: row.statusRefundDamage?.trim() || '',
        statusWithdraw: row.statusWithdraw?.trim() || '',
        unitList: [unitData],
      };

      returnArr.push(newItem);
    }
  }





  await sql.close();
  return returnArr

}


exports.routeQuery = async function (channel) {

  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    database: process.env.MS_SQL_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  };

  await sql.connect(config);

  let result = ''
  if (channel == 'cash') {
    result = await sql.query`
                  SELECT a.Area AS area, 
                    CONVERT(nvarchar(6), GETDATE(), 112) + RouteSet AS id, 
                    RIGHT(RouteSet, 2) AS day, 
                    CONVERT(nvarchar(6), GETDATE(), 112) AS period, 
                    StoreID AS storeId
             FROM [DATA_OMS].[dbo].[DATA_StoreSet] a
             LEFT JOIN [DATA_OMS].[dbo].[OCUSMA] ON StoreID = OKCUNO COLLATE Latin1_General_BIN
             LEFT JOIN [dbo].[data_store] b ON StoreID = customerCode
            WHERE store_status <> '90'
               AND OKCFC3 <> 'DEL'
               AND LEFT(OKRGDT, 6) <> CONVERT(nvarchar(6), GETDATE(), 112)
               AND a.Channel = '103'
             ORDER BY a.Area, RouteSet
        `
  }
  if (channel == 'credit') {
    result = await sql.query`

SELECT a.Area AS area, 
                    CONVERT(nvarchar(6), GETDATE(), 112) + RouteSet AS id, 
                    RIGHT(RouteSet, 2) AS day, 
                    CONVERT(nvarchar(6), GETDATE(), 112) AS period, 
                    StoreID AS storeId
             FROM [DATA_OMS].[dbo].[DATA_StoreSet] a
             LEFT JOIN [DATA_OMS].[dbo].[OCUSMA] ON StoreID = OKCUNO COLLATE Latin1_General_BIN
             LEFT JOIN [dbo].[store_credit] b ON StoreID = customerCode
            WHERE a.Channel = '102'
            ORDER BY a.Area, RouteSet

    `
  }
  await sql.close();
  return result.recordset
}


exports.stockQuery = async function (channel, period) {

  const keyword = `%${period}%`;

  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    database: process.env.MS_SQL_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  };
  const hash = '$2b$10$DqTAeJ.dZ67XVLky203dn.77idSGjHqbOJ7ztOTeEpr1VeycWngua';

  await sql.connect(config);
  let result = ''
  if (channel == 'cash') {
    result = await sql.query`
  SELECT WH, ITEM_CODE, SUM(ITEM_QTY) AS ITEM_QTY
  FROM [dbo].[data_stock_van]
  WHERE Stock_Date LIKE ${keyword}
  GROUP BY WH, ITEM_CODE
`;
  }
  else if (channel == 'credit') {
    result = await sql.query`
SELECT
    DA.Sale_Code as saleCode,
    DA.Sale_Player as salePayer,
    DA.Col_LoginName as username,
    LEFT(DA.Col_NameTH, CHARINDEX(' ', DA.Col_NameTH + ' ') - 1) AS firstName,
    SUBSTRING(DA.Col_NameTH, CHARINDEX(' ', DA.Col_NameTH + ' ') + 1, LEN(DA.Col_NameTH)) AS surName,
    ${hash} AS password,
    'TEL' AS tel,
    DA.ZONE AS zone,
    DA.AREA AS area,
    DA.WH AS warehouse,
    'sale' AS role,
    '1' AS status,
    'http://apps.onetwotrading.co.th/images/qrcode/' + DA.AREA + '.jpg' AS qrCodeImage
FROM 
  [DATA_OMS].[dbo].[DATA_Area] AS DA 
WHERE 
  DA.CHANNEL_NAME = 'Credit' AND 
  DA.Sale_Code is not NULL AND
  DA.Sale_Code != 'ว่าง'
`
  }

  await sql.close();

  return result.recordset
}


exports.groupStoreType = async function () {
  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    database: process.env.MS_SQL_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  };
  await sql.connect(config);

  result = await sql.query`
   select  type_id as id , type_name as name, '1' as status  FROM [dbo].[data_shoptype]
   `

  await sql.close();
  return result.recordset

}