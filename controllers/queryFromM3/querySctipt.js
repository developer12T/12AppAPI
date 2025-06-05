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
    'http://192.168.2.81/images/qrcode/' + DA.AREA + '.jpg' AS qrCodeImage
FROM 
  [DATA_OMS].[dbo].[DATA_Area] AS DA
WHERE 
  DA.CHANNEL_NAME = 'Cash' AND 
  DA.Sale_Code is not NULL`
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
    'http://192.168.2.81/images/qrcode/' + DA.AREA + '.jpg' AS qrCodeImage
FROM 
  [DATA_OMS].[dbo].[DATA_Area] AS DA 
WHERE 
  DA.CHANNEL_NAME = 'Credit' AND 
  DA.Sale_Code is not NULL
`
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
    return result.recordset
}

exports.productQuery = async function (channel) {



    const connection = await mysql.createConnection(config);

    //   const [rows] = await connection.execute('SELECT * FROM your_table'); // แทน query ตรงนี้
    //   console.log(rows);





    let result = ''
    await sql.connect(config);

    if (channel === 'cash') {
        const [result] = await connection.execute(`

        SELECT 
        id,
        [name],
        GRP_CODE,
        [group],
        BRAND_CODE,
        brand,
        size,
        FLAVOUR_CODE,
        flavour,
        type,
        CTN_Gross,
        CTN_Net,
        statusSale,
        statusRefund,
        statusWithdraw,
        unit,
        nameEng,
        nameThai,
        pricePerUnitSale,
        pricePerUnitRefund,
        pricePerUnitChange
FROM (
  SELECT 
    id,
    name,
--     GRP_CODE,
    CASE 
      WHEN [group] = 'พรีเมียม' THEN 'พรีเมี่ยม'
      WHEN [group] = 'ฮอทพอท' THEN 'ซุป HOT POT'
      ELSE [group]
    END AS [group],
    BRAND_CODE,
    brand,
    size,
    d.FLAVOUR as FLAVOUR_CODE,
    a.flavour,
    type,
    CTN_Gross,
    CTN_Net,
    statusSale,
    statusRefund,
    statusWithdraw,
    unit,
    nameEng,
    nameThai,
    pricePerUnitSale,
    pricePerUnitRefund,
    pricePerUnitChange
  FROM ca_product_new a
  LEFT JOIN ca_unit b ON a.unit = b.idUnit
  LEFT JOIN ca_factor c ON a.id = c.itemcode
  LEFT JOIN ( 
      SELECT DISTINCT ITNO, FLAVOUR FROM c_product
  ) d ON a.id = d.ITNO
  LEFT JOIN c_brand f ON a.brand = f.BRAND_DESC
) AS main
  LEFT JOIN c_group e ON main.[group] = e.GRP_DESC
`)
    }
    if (channel === 'credit') {
        result = await sql.query`
SELECT 
-- *
CP.ITNO as id,
CP.NAME_BILL as name,
CP.GRP as [GRP_CODE],
CG.GRP_DESC AS [group],
CP.BRAND AS [BRAND_CODE],
CB.BRAND_DESC AS [brand],
CP.WEIGHT AS [size],
CP.FLAVOUR AS [FLAVOUR],
CF.FAV_DESC as [flavour],
'' as [type],
CFA.CTN_Gross as [weightGross],
CFA.CTN_Net as [weightNet],
'Y' as [statusSale],
'Y' as [statusWithdraw],
'Y' as [statusRefund],
CU.UNIT_CODE_BC AS [unitId],
CP.UNIT as [unit] ,
CU.UNIT_DESC,
CP.PRICE  AS [pricePerUnitSale],
CP.PRICE  AS [pricePerUnitRefund],
CP.PRICE  AS [pricePerUnitChange]
FROM [c_product] as [CP]
join (select UNIT_CODE, UNIT_DESC,UNIT_CODE_BC from c_unit where UNIT_DESC in ('ผืน' , 'ชุด', 'หีบ') ) as CU ON
CP.UNIT = CU.UNIT_CODE
LEFT JOIN ca_factor CFA ON CP.ITNO = CFA.itemcode
LEFT JOIN c_flavour CF on CP.FLAVOUR = CF.FAV_CODE
LEFT JOIN c_group CG ON CP.GRP = CG.GRP_CODE
LEFT JOIN c_brand CB ON CP.brand = CB.BRAND_CODE
where CP.UNIT = 'CTN' or CP.NAME_STD like '%ผ้า%'
`
    }

    await sql.close();
    return result.recordset

}