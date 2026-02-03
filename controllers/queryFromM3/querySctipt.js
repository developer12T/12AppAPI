const sql = require('mssql')
const mysql = require('mysql2/promise')
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
  }
  const hash = '$2b$10$DqTAeJ.dZ67XVLky203dn.77idSGjHqbOJ7ztOTeEpr1VeycWngua'

  await sql.connect(config)

  let result = ''
  if (channel == 'cash') {
    result = await sql.query`
SELECT
    DA.Sale_Code as saleCode,
    DA.Sale_Player as salePayer,
    DA.Col_LoginName as username,
    LEFT(DA.Col_NameTH, CHARINDEX(' ', DA.Col_NameTH + ' ') - 1) AS firstName,
    SUBSTRING(DA.Col_NameTH, CHARINDEX(' ', DA.Col_NameTH + ' ') + 1, LEN(DA.Col_NameTH)) AS surName,
    SUBSTRING(
    REPLACE(CONVERT(VARCHAR(40), NEWID()), '-', ''),
    1, 6
) AS password,
    SALE_MOBILE AS tel,
    DA.ZONE AS zone,
    DA.AREA AS area,
    DA.WH AS warehouse,
    'sale' AS role,
    '1' AS status,
    TRUCK_SIZE AS typeTruck,
    TRUCK_NO as noTruck,
    'https://apps.onetwotrading.co.th/images/qrcode/' + DA.AREA + '.jpg' AS qrCodeImage,
    case 
     when CHANNEL_NAME = 'Cash' THEN 'CASH'
     else CHANNEL_NAME 
     end as platformType
    
FROM 
  [DATA_OMS].[dbo].[DATA_Area] AS DA
WHERE 
  DA.CHANNEL_NAME = 'Cash' 
  and  DA.Sale_Code != '99999'
  `
  } else if (channel == 'credit') {
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
  } else if (channel == 'pc') {
    result = await sql.query`
SELECT
    DA.Sale_Code as saleCode,
    DA.Sale_Player as salePayer,
    DA.Col_LoginName as username,
    LEFT(DA.Col_NameTH, CHARINDEX(' ', DA.Col_NameTH + ' ') - 1) AS firstName,
    SUBSTRING(DA.Col_NameTH, CHARINDEX(' ', DA.Col_NameTH + ' ') + 1, LEN(DA.Col_NameTH)) AS surName,
    SUBSTRING(
    REPLACE(CONVERT(VARCHAR(40), NEWID()), '-', ''),
    1, 6
) AS password,
    SALE_MOBILE AS tel,
    DA.ZONE AS zone,
    DA.AREA AS area,
    DA.WH AS warehouse,
    'sale' AS role,
    '1' AS status,
    TRUCK_SIZE AS typeTruck,
    TRUCK_NO as noTruck,
    'https://apps.onetwotrading.co.th/images/qrcode/' + DA.AREA + '.jpg' AS qrCodeImage,
        case 
     when CHANNEL_NAME = 'PC' THEN 'PC'
     else CHANNEL_NAME 
     end as platformType
FROM 
  [DATA_OMS].[dbo].[DATA_Area] AS DA
WHERE 
  DA.CHANNEL_NAME = 'PC' 
  `
  }

  // AND
  // DA.Sale_Code is not NULL AND
  // DA.Sale_Code != 'ว่าง'
  await sql.close()
  return result.recordset
}

exports.userPcSample = async function (channel, area) {
  const config = {
    host: process.env.MY_SQL_SERVER,
    user: process.env.MY_SQL_USER,
    password: process.env.MY_SQL_PASSWORD,
    database: process.env.MY_SQL_DATABASE
  }

  const connection = await mysql.createConnection(config)

  const query = `
        SELECT
              TRIM(REPLACE(REPLACE(REPLACE(SALECODE, '\r', ''), '\n', ''), '\t', '')) AS saleCode,
  TRIM(REPLACE(REPLACE(REPLACE(SALE_PAYER, '\r', ''), '\n', ''), '\t', '')) AS salePayer,
  TRIM(REPLACE(REPLACE(REPLACE(SALE_USERNAME, '\r', ''), '\n', ''), '\t', '')) AS username,
  SUBSTRING_INDEX(TRIM(REPLACE(REPLACE(REPLACE(SALE_NAME, '\r', ''), '\n', ''), '\t', '')), ' ', 1) AS firstName,
  TRIM(SUBSTRING_INDEX(TRIM(REPLACE(REPLACE(REPLACE(SALE_SNAME, '\r', ''), '\n', ''), '\t', '')), ' ', -1)) AS surName,
  '24e6b727065bbc15f1cf8d576c32fd53' AS password,
  '' AS tel,
  TRIM(REPLACE(REPLACE(REPLACE(SALE_ZONE, '\r', ''), '\n', ''), '\t', '')) AS zone,
  TRIM(REPLACE(REPLACE(REPLACE(SALE_AREA, '\r', ''), '\n', ''), '\t', '')) AS area,
  TRIM(REPLACE(REPLACE(REPLACE(SALE_WH, '\r', ''), '\n', ''), '\t', '')) AS warehouse,
  'sale' AS role,
  '1' AS status,
  '' AS typeTruck,
  '' AS noTruck,
  CONCAT(
    'https://apps.onetwotrading.co.th/images/qrcode/',
    TRIM(REPLACE(REPLACE(REPLACE(SALE_AREA, '\r', ''), '\n', ''), '\t', '')),
    '.jpg'
  ) AS qrCodeImage,
  TRIM(REPLACE(REPLACE(REPLACE(SALE_CH, '\r', ''), '\n', ''), '\t', '')) AS platformType
    FROM 
      vancash.p_sale
    -- WHERE 
    --   DA.CHANNEL_NAME = 'Cash' OR 
    --   DA.Sale_Code is not NULL AND
    --   DA.Sale_Code != 'ว่าง' 
        `
  // console.log(query)

  const [result] = await connection.execute(query, [channel])

  return result
}

exports.userQueryOne = async function (channel, area) {
  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    database: process.env.MS_SQL_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  }
  const hash = '$2b$10$DqTAeJ.dZ67XVLky203dn.77idSGjHqbOJ7ztOTeEpr1VeycWngua'

  const areStr = area
  await sql.connect(config)

  let result = ''
  if (channel == 'cash') {
    result = await sql.query`
SELECT
    DA.Sale_Code as saleCode,
    DA.Sale_Player as salePayer,
    DA.Col_LoginName as username,
    LEFT(DA.Col_NameTH, CHARINDEX(' ', DA.Col_NameTH + ' ') - 1) AS firstName,
    SUBSTRING(DA.Col_NameTH, CHARINDEX(' ', DA.Col_NameTH + ' ') + 1, LEN(DA.Col_NameTH)) AS surName,
    SUBSTRING(
    REPLACE(CONVERT(VARCHAR(40), NEWID()), '-', ''),
    1, 6
) AS password,
    SALE_MOBILE AS tel,
    DA.ZONE AS zone,
    DA.AREA AS area,
    DA.WH AS warehouse,
    'sale' AS role,
    '1' AS status,
    TRUCK_SIZE AS typeTruck,
    TRUCK_NO as noTruck,
    'https://apps.onetwotrading.co.th/images/qrcode/' + DA.AREA + '.jpg' AS qrCodeImage
FROM 
  [DATA_OMS].[dbo].[DATA_Area] AS DA
WHERE 
  DA.CHANNEL_NAME = 'Cash' AND 
  DA.Sale_Code is not NULL AND
  DA.Sale_Code != 'ว่าง'  AND
  DA.AREA = ${areStr}
  `
  } else if (channel == 'credit') {
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

  await sql.close()
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
  }
  const hash = '$2b$10$DqTAeJ.dZ67XVLky203dn.77idSGjHqbOJ7ztOTeEpr1VeycWngua'

  await sql.connect(config)

  let result = ''
  if (channel == 'cash') {
    result = await sql.query`
SELECT 
     '' AS saleCode,
     '' AS salePayer,
    Col_LoginName AS username,
    LEFT(Col_Name, CHARINDEX(' ', Col_Name + ' ') - 1) AS firstName,
    SUBSTRING(Col_Name, CHARINDEX(' ', Col_Name + ' ') + 1, LEN(Col_Name)) AS surName,
    '24e6b727065bbc15f1cf8d576c32fd53' AS password,
    '' AS tel,
     CASE
    WHEN Col_o_JobTitle IN ('Developer', 'IT Support', 'Sale_Manager') THEN ''
    ELSE Col_o_Address
  END AS zone ,
    '' AS area,
    '' AS warehouse,
    case 
    when Col_o_JobTitle = 'Supervisor' THEN 'supervisor'
    when Col_o_JobTitle like 'DC%' THEN 'dc'
    when Col_o_JobTitle = 'Area_Manager' then 'area_manager'
    when Col_o_JobTitle = 'Sale_Manager' then 'sale_manager'
    ELSE 'admin'
    END AS role,

    '1' AS status
    FROM [AntDB].[dbo].[hs_User] AS hr
    WHERE Col_o_JobTitle NOT IN ('cash', 'credit', 'Credit Top', 'PC', 'EV', 'Food Service') 
  
    `
  } else if (channel == 'cash') {
  }
  await sql.close()

  return result.recordset
}

exports.userQueryFilter = async function (channel, area) {
  const array = area.map(code => `'${code}'`).join(',')
  // console.log(`(${array})`)
  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    database: process.env.MS_SQL_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  }
  const hash = '$2b$10$DqTAeJ.dZ67XVLky203dn.77idSGjHqbOJ7ztOTeEpr1VeycWngua'
  await sql.connect(config)

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
`
    result = await sql.query(query)
  } else if (channel == 'credit') {
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
`
    result = await sql.query(query)
  }
  await sql.close()
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
  }
  let result = ''
  await sql.connect(config)

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
                    store_status as status,
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
  `
  } else if (channel === 'credit') {
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
  `
  }
  await sql.close()

  const return_arr = []
  for (const row of result.recordset) {
    // console.log(row)
    const storeId = row.customerCode?.trim()
    const name = row.customerName || ''.trim()
    const taxId = row.customerTax?.trim()
    const tel = row.customerTel?.trim()
    const route = row.OKCFC3?.trim()
    const type = row.OKCFC6?.trim()
    const typeName = row.type_name || ''.trim()
    const address = row.address || ''.trim()
    const subDistrict = row.subDistrict || ''.trim()
    const district = row.district || ''.trim()
    const province = row.province || ''.trim()
    const provinceCode = row.provinceCode || ''.trim()
    const postCode = row.postCode?.trim()
    const status = row.status?.trim()
    const zone = row.OKSDST?.trim()
    const area = row.area?.trim()
    const latitude = row.lat?.trim()
    const longtitude = row.long?.trim()
    const createdAt = row.date_create ? String(row.date_create).trim() : ''

    const defaultShipping = String(row.ship_default)?.trim()
    const shippingId = String(row.shippingId)?.trim()
    const ship_address = row.ship_address || ''.trim()
    const ship_subDistrict = row.ship_subDistrict || ''.trim()
    const ship_district = row.ship_district || ''.trim()
    const ship_province = row.ship_province || ''.trim()
    const ship_postCode = row.ship_postcode?.trim()
    const ship_latitude = String(row.ship_lat ?? '').trim()
    const ship_longtitude = String(row.ship_long ?? '').trim()

    const shippingAddress = {
      default: defaultShipping,
      shippingId,
      address: ship_address,
      subDistrict: ship_subDistrict,
      district: ship_district,
      province: ship_province,
      postCode: ship_postCode,
      latitude: ship_latitude,
      longtitude: ship_longtitude
    }

    const existingStore = return_arr.find(store => store.storeId === storeId)

    if (existingStore) {
      existingStore.shippingAddress.push(shippingAddress)
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
        postCode,
        status,
        area,
        latitude,
        longtitude,
        createdAt,
        shippingAddress: [shippingAddress]
      })
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
    ;(mainData = {
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
      status: splitData.status,
      policyConsent: poliAgree,
      imageList: [],
      shippingAddress: splitData.shippingAddress,
      checkIn: {},
      createdAt: splitData.createdAt,
      updatedDate: Date()
    }),
      data.push(mainData)
  }

  return data
}

exports.storeQueryFilter = async function (channel, storeId) {
  const array = storeId.map(code => `'${code}'`).join(',')

  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    database: process.env.MS_SQL_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  }
  let result = ''
  await sql.connect(config)

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
  `
    result = await sql.query(query)
  } else if (channel === 'credit') {
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
  `
    result = await sql.query(query)
  }
  await sql.close()
  const return_arr = []
  for (const row of result.recordset) {
    // console.log(row)
    const storeId = row.customerCode?.trim()
    const name = row.customerName || ''.trim()
    const taxId = row.customerTax?.trim()
    const tel = row.customerTel?.trim()
    const route = row.OKCFC3?.trim()
    const type = row.OKCFC6?.trim()
    const typeName = row.type_name || ''.trim()
    const address = row.address || ''.trim()
    const subDistrict = row.subDistrict || ''.trim()
    const district = row.district || ''.trim()
    const province = row.province || ''.trim()
    const provinceCode = row.provinceCode || ''.trim()
    const postCode = row.postCode?.trim()
    const zone = row.OKSDST?.trim()
    const area = row.area?.trim()
    const latitude = row.lat?.trim()
    const longtitude = row.long?.trim()
    const createdAt = row.date_create ? String(row.date_create).trim() : ''

    const defaultShipping = String(row.ship_default)?.trim()
    const shippingId = String(row.shippingId)?.trim()
    const ship_address = row.ship_address || ''.trim()
    const ship_subDistrict = row.ship_subDistrict || ''.trim()
    const ship_district = row.ship_district || ''.trim()
    const ship_province = row.ship_province || ''.trim()
    const ship_postCode = row.ship_postcode?.trim()
    const ship_latitude = String(row.ship_lat ?? '').trim()
    const ship_longtitude = String(row.ship_long ?? '').trim()

    const shippingAddress = {
      default: defaultShipping,
      shippingId,
      address: ship_address,
      subDistrict: ship_subDistrict,
      district: ship_district,
      province: ship_province,
      postCode: ship_postCode,
      latitude: ship_latitude,
      longtitude: ship_longtitude
    }

    const existingStore = return_arr.find(store => store.storeId === storeId)

    if (existingStore) {
      existingStore.shippingAddress.push(shippingAddress)
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
        shippingAddress: [shippingAddress]
      })
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
    ;(mainData = {
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
    }),
      data.push(mainData)
  }

  return data
}

exports.productQuery = async function (channel) {
  const config = {
    host: process.env.MY_SQL_SERVER,
    user: process.env.MY_SQL_USER,
    password: process.env.MY_SQL_PASSWORD,
    database: process.env.MY_SQL_DATABASE
  }

  const connection = await mysql.createConnection(config)

  let priceType = ''
  let openType = ''
  if (channel === 'cash') {
    priceType = 'PRICE'
    openType = 'IS_OPEN'
  } else if (channel === 'credit') {
    priceType = 'PRICE'
    openType = 'IS_OPEN'
  } else if (channel === 'pc') {
    priceType = 'PRICE2'
    openType = 'IS_OPEN2'
  }
  const id = name => connection.escapeId(name)
  const query = `
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
      ${id(openType)} as statusSale,
      IS_OPEN3 as statusRefund,
      IS_OPEN4 as statusRefundDamage,
      IS_OPEN5 as statusWithdraw,
      unit_cal as unit ,
      UNIT_CODE as nameEng,
      UNIT_DESC as nameThai,
      ${id(priceType)} as pricePerUnitSale ,
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
      `
  // console.log(query)

  const [result] = await connection.execute(query, [channel])

  const returnArr = []

  for (const row of result) {
    // console.log(row)
    const id = String(row.id).trim()
    const unitId = parseInt(row.unit)
    const unit = row.nameEng?.trim() || ''
    const name = row.nameThai?.trim() || ''
    const priceSale = row.pricePerUnitSale
    const priceRefund = row.pricePerUnitRefund
    const priceRefundDmg = row.pricePerUnitRefundDamage
    const priceChange = row.pricePerUnitChange

    const existingItem = returnArr.find(item => item.id === id)

    const unitData = {
      id: unitId,
      unit: unit,
      name: name,
      pricePerUnitSale: priceSale,
      pricePerUnitRefund: priceRefund,
      pricePerUnitRefundDamage: priceRefundDmg,
      pricePerUnitChange: priceChange
    }
    // console.log(unitData)
    if (existingItem) {
      existingItem.unitList.push(unitData)
    } else {
      const newItem = {
        id: id,
        name: row.name?.trim() || '',
        groupCode: row.GRP_CODE?.trim() || '',
        group: row.group?.trim() || '',
        groupCodeM3: row.groupCodeM3?.trim() || '',
        groupM3: row.groupM3?.trim() || '',
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
        unitList: [unitData]
      }

      returnArr.push(newItem)
    }
  }

  await sql.close()
  return returnArr
}

exports.routeQuery = async function (channel, area) {
  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    database: process.env.MS_SQL_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  }

  await sql.connect(config)

  let result = ''
  if (channel == 'cash') {
    if (area) {
      result = await sql.query`
            SELECT a.Area AS area, 
                    CONVERT(nvarchar(6), GETDATE(), 112) + RouteSet AS id, 
                    RIGHT(RouteSet, 2) AS day, 
                    CONVERT(nvarchar(6), GETDATE(), 112) AS period, 
                    a.StoreID AS storeId
             FROM [DATA_OMS].[dbo].[DATA_StoreSet] a
             LEFT JOIN [DATA_OMS].[dbo].[OCUSMA] ON StoreID = OKCUNO COLLATE Latin1_General_BIN
             LEFT JOIN [dbo].[data_store] b ON StoreID = customerCode
            WHERE 
                store_status <> '90' 
                AND 
                LEFT(OKRGDT, 6) <> CONVERT(nvarchar(6), GETDATE(), 112)
               AND a.Channel = '103'
               AND a.Area = ${area}
             ORDER BY a.Area, RouteSet
        `
    } else {
      result = await sql.query`
                  SELECT a.Area AS area, 
                    CONVERT(nvarchar(6), GETDATE(), 112) + RouteSet AS id, 
                    RIGHT(RouteSet, 2) AS day, 
                    CONVERT(nvarchar(6), GETDATE(), 112) AS period, 
                    a.StoreID AS storeId
             FROM [DATA_OMS].[dbo].[DATA_StoreSet] a
             LEFT JOIN [DATA_OMS].[dbo].[OCUSMA] ON StoreID = OKCUNO COLLATE Latin1_General_BIN
             LEFT JOIN [dbo].[data_store] b ON StoreID = customerCode
            WHERE 
                store_status <> '90' 
                AND 
                LEFT(OKRGDT, 6) <> CONVERT(nvarchar(6), GETDATE(), 112)
               AND a.Channel = '103'
             ORDER BY a.Area, RouteSet
      `
    }
  }
  await sql.close()
  return result.recordset
}

exports.routeQueryOne = async function (channel, RouteId) {
  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    database: process.env.MS_SQL_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  }
  // console.log(RouteId)
  await sql.connect(config)

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
               AND LEFT(OKRGDT, 6) <> CONVERT(nvarchar(6), GETDATE(), 112)
               AND a.Channel = '103'
                AND CONVERT(nvarchar(6), GETDATE(), 112) + RouteSet =${RouteId}
             ORDER BY a.Area, RouteSet
        `
  }
  //   if (channel == 'credit') {
  //     result = await sql.query`

  // SELECT a.Area AS area,
  //                     CONVERT(nvarchar(6), GETDATE(), 112) + RouteSet AS id,
  //                     RIGHT(RouteSet, 2) AS day,
  //                     CONVERT(nvarchar(6), GETDATE(), 112) AS period,
  //                     StoreID AS storeId
  //              FROM [DATA_OMS].[dbo].[DATA_StoreSet] a
  //              LEFT JOIN [DATA_OMS].[dbo].[OCUSMA] ON StoreID = OKCUNO COLLATE Latin1_General_BIN
  //              LEFT JOIN [dbo].[store_credit] b ON StoreID = customerCode
  //             WHERE a.Channel = '102'
  //             ORDER BY a.Area, RouteSet

  //     `
  //   }
  await sql.close()
  return result.recordset
}

exports.dataPowerBiQuery = async function (channel, column) {
  const config = {
    user: process.env.POWERBI_USER,
    password: process.env.POWERBI_PASSWORD,
    server: process.env.POWERBI_HOST,
    database: process.env.POWERBI_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  }
  // console.log(RouteId)
  await sql.connect(config)

  let result = ''
  if (channel == 'cash') {
    const query = `
      SELECT DISTINCT INVO 
      FROM [dbo].[CO_ORDER]   
      WHERE STATUS_BILL = '11' AND CHANNEL = '103'
    `
    result = await sql.query(query)
  }

  await sql.close()

  return result.recordset
}

exports.dataPowerBiQueryInsert = async function (channel, data) {
  const config = {
    user: process.env.POWERBI_USER,
    password: process.env.POWERBI_PASSWORD,
    server: process.env.POWERBI_HOST,
    database: process.env.POWERBI_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  }
  // console.log(RouteId)
  await sql.connect(config)

  for (const item of data) {
    const request = new sql.Request()
    for (let [key, value] of Object.entries(item)) {
      request.input(key, value)
    }

    const query = `
    INSERT INTO [dbo].[CO_ORDER] (
      ${Object.keys(item).join(',')}
    ) VALUES (
      ${Object.keys(item)
        .map(k => '@' + k)
        .join(',')}
    )
  `
    await request.query(query)
  }
}

// exports.dataUpsertSendMoney = async function (channel, data, primaryKeys = []) {
//   const config = {
//     host: process.env.MY_SQL_SERVER,
//     user: process.env.MY_SQL_USER,
//     password: process.env.MY_SQL_PASSWORD,
//     database: process.env.MY_SQL_DATABASE
//   }

//   const connection = await mysql.createConnection(config)

//   for (const item of data) {
//     const keys = Array.isArray(primaryKeys) ? primaryKeys : [primaryKeys]

//     const allFields = Object.keys(item)

//     // ---------- INSERT ----------
//     const insertFields = allFields.map(f => `\`${f}\``).join(', ')
//     const insertPlaceholders = allFields.map(() => '?').join(', ')
//     const insertValues = allFields.map(f => item[f])

//     // ---------- UPDATE ----------
//     const updateFields = allFields.filter(f => !keys.includes(f))

//     const updateClause = [
//       ...updateFields.map(f => `\`${f}\` = VALUES(\`${f}\`)`),
//       '`period` = NOW()' // ⭐ สำคัญ: เวลาตอนอัปเดต
//     ].join(', ')

//     const sql = `
//       INSERT INTO \`v_payin\`
//       (${insertFields})
//       VALUES (${insertPlaceholders})
//       ON DUPLICATE KEY UPDATE
//       ${updateClause}
//     `

//     await connection.execute(sql, insertValues)
//   }

//   await connection.end()
// }

exports.dataUpsertSendMoney = async function (channel, data) {
  const config = {
    host: process.env.MY_SQL_SERVER,
    user: process.env.MY_SQL_USER,
    password: process.env.MY_SQL_PASSWORD,
    database: process.env.MY_SQL_DATABASE
  }

  const connection = await mysql.createConnection(config)

  for (const item of data) {
    const allFields = Object.keys(item)

    // ---------- INSERT ----------
    const insertFields = allFields.map(f => `\`${f}\``).join(', ')
    const insertPlaceholders = allFields.map(() => '?').join(', ')
    const insertValues = allFields.map(f => item[f])

    // ---------- UPDATE ----------
    // 🔑 key = wh + datemonth (ห้าม update)
    const updateFields = allFields.filter(f => !['wh', 'datemonth'].includes(f))

    const updateClause = updateFields
      .map(f => `\`${f}\` = VALUES(\`${f}\`)`)
      .join(', ')

    const sql = `
      INSERT INTO \`v_payin\`
      (${insertFields})
      VALUES (${insertPlaceholders})
      ON DUPLICATE KEY UPDATE
      ${updateClause}
    `

    await connection.execute(sql, insertValues)
  }

  await connection.end()
}

exports.upsertSendMoneySummary = async (mysqlConn, rows) => {
  const sql = `
    INSERT INTO sendmoney_summary (
      period,
      warehouse,
      area,
      sale,
      change_amt,
      refund,
      total_sale,
      sendmoney,
      sendmoney_acc,
      diff,
      diff_acc
    ) VALUES ?
    ON DUPLICATE KEY UPDATE
      area = VALUES(area),
      sale = VALUES(sale),
      change_amt = VALUES(change_amt),
      refund = VALUES(refund),
      total_sale = VALUES(total_sale),
      sendmoney = VALUES(sendmoney),
      sendmoney_acc = VALUES(sendmoney_acc),
      diff = VALUES(diff),
      diff_acc = VALUES(diff_acc),
      updated_at = NOW()
  `

  const values = rows.map(r => [
    r.period,
    r.warehouse,
    r.area,
    r.sale,
    r.change,
    r.refund,
    r.totalSale,
    r.sendmoney,
    r.sendmoneyAcc,
    r.diff,
    r.diffAcc
  ])

  if (values.length === 0) return

  await mysqlConn.query(sql, [values])
}

exports.dataUpdateTotalSale = async function (channel, data, primaryKeys = []) {
  const config = {
    host: process.env.MY_SQL_SERVER,
    user: process.env.MY_SQL_USER,
    password: process.env.MY_SQL_PASSWORD,
    database: process.env.MY_SQL_DATABASE
  }

  const connection = await mysql.createConnection(config)

  for (const item of data) {
    // ถ้า primaryKey เป็น string เดี่ยว ให้แปลงเป็น array
    const keysToFilter = Array.isArray(primaryKeys)
      ? primaryKeys
      : [primaryKeys]

    // เอาฟิลด์ทั้งหมด ยกเว้น primaryKeys
    const updateFields = Object.keys(item).filter(
      k => !keysToFilter.includes(k)
    )
    const updateValues = updateFields.map(k => item[k])
    const setClause = updateFields.map(k => `\`${k}\` = ?`).join(', ')

    // WHERE condition
    const whereClause = keysToFilter.map(k => `\`${k}\` = ?`).join(' AND ')
    const whereValues = keysToFilter.map(k => item[k])

    const query = `
      UPDATE \`van_sendmoneytransfer\`
      SET ${setClause}
      WHERE ${whereClause}
    `

    await connection.execute(query, [...updateValues, ...whereValues])
  }

  await connection.end()
}

// exports.dataWithdrawInsert = async function (channel, data) {
//   const config = {
//     user: process.env.POWERBI_USER,
//     password: process.env.POWERBI_PASSWORD,
//     server: process.env.POWERBI_HOST,
//     database: process.env.POWERBI_DATABASE,
//     options: {
//       encrypt: false,
//       trustServerCertificate: true
//     }
//   }
//   // console.log(RouteId)
//   await sql.connect(config)

//   for (const item of data) {
//     const request = new sql.Request()
//     for (let [key, value] of Object.entries(item)) {
//       request.input(key, value)
//     }

//     const query = `
//     INSERT INTO [dbo].[withdrawCash] (
//       ${Object.keys(item).join(',')}
//     ) VALUES (
//       ${Object.keys(item)
//         .map(k => '@' + k)
//         .join(',')}
//     )
//   `
//     await request.query(query)
//   }
// }

exports.dataWithdrawInsert = async function (channel, data) {
  const config = {
    user: process.env.POWERBI_USER,
    password: process.env.POWERBI_PASSWORD,
    server: process.env.POWERBI_HOST,
    database: process.env.POWERBI_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  }

  const pool = await sql.connect(config)

  for (const item of data) {
    const request = pool.request()

    // ใส่ parameter ทั้งหมด
    for (let [key, value] of Object.entries(item)) {
      request.input(key, value)
    }

    const columns = Object.keys(item).join(',')
    const values = Object.keys(item)
      .map(k => '@' + k)
      .join(',')

    // ปรับชื่อ PK ให้ตรง schema จริงของ withdrawCash
    const query = `
      BEGIN TRY
        IF NOT EXISTS (
          SELECT 1
          FROM [dbo].[withdrawCash] WITH (UPDLOCK, HOLDLOCK)
          WHERE WD_NO = @WD_NO AND ITEM_CODE = @ITEM_CODE
        )
        BEGIN
          INSERT INTO [dbo].[withdrawCash] (${columns})
          VALUES (${values})
        END
      END TRY
      BEGIN CATCH
        -- ตรวจว่าเป็น Duplicate Key Error
        IF ERROR_NUMBER() IN (2627,2601)
        BEGIN
          -- duplicate → ไม่ throw ออกไป
          PRINT 'Duplicate skip';
        END
        ELSE
        BEGIN
          -- error อื่นให้โยนขึ้นไปข้างนอก
          THROW;
        END
      END CATCH
    `

    try {
      await request.query(query)
    } catch (err) {
      // ถ้าเป็น duplicate
      if (err.message.includes('2627') || err.message.includes('PRIMARY KEY')) {
        console.warn(
          `⚠️ Skip duplicate WD_NO=${item.WD_NO}, ITEM_CODE=${item.ITEM_CODE}`
        )
        continue
      }

      // error อื่นต้อง log แต่ไม่ throw (เพื่อให้ลูปทำต่อได้)
      console.error(`❌ SQL Error for WD_NO=${item.WD_NO}`, err.message)
      continue
    }
  }
}

exports.dataPowerBiQueryDelete = async function (channel, cono) {
  if (!cono || cono.length === 0) {
    return
  }
  const conoStr = cono.map(c => `'${c}'`).join(',') // =>  '1001','1002','1003'
  const config = {
    user: process.env.POWERBI_USER,
    password: process.env.POWERBI_PASSWORD,
    server: process.env.POWERBI_HOST,
    database: process.env.POWERBI_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  }
  // console.log(RouteId)
  await sql.connect(config)

  if (channel === 'cash') {
    const query = `
      DELETE FROM [dbo].[CO_ORDER]
      WHERE INVO IN (${conoStr})
      AND CHANNEL = '103'
      AND STATUS_BILL = '11'
    `

    const result = await sql.query(query)
    await sql.close()
    return result.recordset
  }
}

exports.dataM3Query = async function (channel) {
  const config = {
    user: process.env.M3_USER,
    password: process.env.M3_PASSWORD,
    server: process.env.M3_HOST,
    database: process.env.M3_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  }
  // console.log(RouteId)
  await sql.connect(config)

  let result = ''
  if (channel == 'cash') {
    result = await sql.query`
SELECT DISTINCT OACUOR FROM [MVXJDTA].[OOHEAD]
        `
  }

  await sql.close()
  return result.recordset
}

exports.stockQuery = async function (channel, period, wereHouse) {
  const year = period.slice(0, 4) // "2025"
  const month = period.slice(4, 6) // "09"
  const formatted = `%${period}%`
  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    database: process.env.MS_SQL_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  }
  const hash = '$2b$10$DqTAeJ.dZ67XVLky203dn.77idSGjHqbOJ7ztOTeEpr1VeycWngua'

  await sql.connect(config)
  let result = ''
  if (channel == 'cash') {
    if (wereHouse) {
      ;`
  SELECT WH, 
  ITEM_CODE, 
  SUM(ITEM_QTY) AS ITEM_QTY
  FROM [dbo].[data_stock_van]
  WHERE Stock_Date LIKE ${formatted} AND
  WH = ${wereHouse}
  GROUP BY WH, ITEM_CODE`
    } else {
      result = await sql.query`
  SELECT WH, 
  ITEM_CODE, 
  SUM(ITEM_QTY) AS ITEM_QTY
  FROM [dbo].[data_stock_van]
  WHERE Stock_Date LIKE ${formatted}
  GROUP BY WH, ITEM_CODE
`
    }
  } else if (channel == 'credit') {
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

  await sql.close()

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
  }
  await sql.connect(config)

  result = await sql.query`
   select  type_id as id , type_name as name, '1' as status  FROM [dbo].[data_shoptype]
   `

  await sql.close()
  return result.recordset
}

exports.withdrawQuery = async function (channel) {
  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    database: process.env.MS_SQL_DATABASE_OMS,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  }
  // console.log(RouteId)
  await sql.connect(config)

  result = await sql.query`
       SELECT * FROM pc_withdraws_destination
   `

  await sql.close()
  return result.recordset
}

exports.bueatyStoreQuery = async function (channel) {
  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    // database: process.env.MS_SQL_DATABASE_OMS,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  }
  // console.log(RouteId)
  await sql.connect(config)

  result = await sql.query`
SELECT 
cus_code as storeId,
cus_area as area

 FROM [DATA_BEAUTY].[dbo].[DATA_BEAUTY_CUSTOMER]
WHERE CUS_STATUS = 'N'

   `

  await sql.close()
  return result.recordset
}

exports.getDataRoute = async function () {
  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    database: process.env.MS_SQL_DATABASE_OMS,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  }
  // console.log(RouteId)
  await sql.connect(config)

  result = await sql.query`
SELECT distinct CUSCODE FROM [dbo].[DATA_ROUTE]
where PROVINCE like '%ฉะเชิงเทรา%' and AREA_NEW = 'ET211'

   `

  await sql.close()
  return result.recordset
}

exports.wereHouseQuery = async function (channel) {
  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    // database: process.env.MS_SQL_DATABASE_OMS,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  }
  // console.log(RouteId)
  await sql.connect(config)

  result = await sql.query`
      SELECT MWWHLO as wh_code, MWWHNM as wh_name
      FROM     [192.168.2.74].[M3FDBPRD].[MVXJDTA].[MITWHL]
      WHERE  (MWCONO = 410) AND (MWWHNM LIKE N'ศูนย์%') AND (MWWHLO <> N'100')

   `
  // FROM     [${process.env.SERVER_WEREHOUSE}].[M3FDBPRD].[MVXJDTA].[MITWHL]
  await sql.close()
  return result.recordset
}

exports.productFoodtruckQuery = async function () {
  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    database: process.env.MS_SQL_DATABASE_Food_Truck,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  }
  await sql.connect(config)

  result = await sql.query`
   select * FROM [dbo].[M_PRODUCT]
    where ITNO like 'ZNS%'
   `

  await sql.close()
  return result.recordset
}

exports.stockPcQuery = async function (channel, period, wereHouse) {
  const year = period.slice(0, 4) // "2025"
  const month = period.slice(4, 6) // "09"
  const formatted = `%${year}-${month}%`
  // console.log(formatted)
  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    database: process.env.MS_SQL_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  }
  const hash = '$2b$10$DqTAeJ.dZ67XVLky203dn.77idSGjHqbOJ7ztOTeEpr1VeycWngua'

  await sql.connect(config)
  let result = ''
  if (channel === 'cash' || channel === 'pc') {
    if (wereHouse) {
      ;`
  SELECT WH, 
  ITEM_CODE, 
  SUM(ITEM_QTY) AS ITEM_QTY
  FROM [dbo].[data_stock_pc]
  WHERE Stock_Date LIKE ${formatted} AND
  WH = ${wereHouse}
  GROUP BY WH, ITEM_CODE`
    } else {
      result = await sql.query`
  SELECT WH, 
  ITEM_CODE, 
  SUM(ITEM_QTY) AS ITEM_QTY
  FROM [dbo].[data_stock_pc]
  WHERE Stock_Date LIKE ${formatted}
  GROUP BY WH, ITEM_CODE
`
    }
  }
  await sql.close()

  return result.recordset
}

exports.updateLatLong = async function (channel, storeList) {
  if (channel !== 'cash') return

  const config = {
    user: process.env.MS_SQL_USER,
    password: process.env.MS_SQL_PASSWORD,
    server: process.env.MS_SQL_SERVER,
    database: process.env.MS_SQL_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  }

  const pool = await sql.connect(config)

  for (const store of storeList) {
    const request = pool.request()

    request.input('customerCode', sql.NVarChar(10), store.customerCode)
    request.input('lat', sql.NVarChar(20), store.latitude)
    request.input('long', sql.NVarChar(20), store.longtitude)

    await request.query(`
      UPDATE dbo.data_store
      SET lat = @lat,
          long = @long
      WHERE customerCode = @customerCode
    `)
  }
}
