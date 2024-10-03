var js2x = require('xml-js')


const from = {
  server: '161.97.138.208',
  port: 1433,
  user: 'sa',
  password: 'Y259QcT',
  database: 'UPS_Control',
  requestTimeout: 180000,
  options: {
    trustServerCertificate: true,
    encrypt: false
  },
}
const to = 'mongodb://dev2/ups-cr?replicaSet=gpaxio'
//const to = 'mongodb://gpax2,gpax3/gpax?replicaSet=gpax'
const collection = 'shipmentExport'
const collection2 = 'idMigration'
const query =
  `SELECT
            es.[FECHA_CARGA] as importDate,
    es.[ORIGIN_COUNTRY] as originCountry,
    es.[ORIGIN_PORT] as originPort,
    es.[DESTINATION_COUNTRY]as destinationCountry,
    es.[DESTINATION_PORT]as destinationPort ,
    es.[IMPORT_DATE] as deliveryDate ,
    es.[MAWB_NUMBER] as mawbNumber,
    es.[SHIPMENT_TYPE] as shipmentType,
    es.[SHIPMENT_NUMBER] ,
    es.[RECORD_TYPE] as recordType  ,
    es.[SHIPMENT_ID] as _id,
    es.[BILLING_TYPE_SHIPMENT] as billingType,
    es.[NUMBER_PACKAGE_IN_SHIPMENT]as numberPackages,
    es.[SHIPMENT_WEIGHT] as shipmentWeight,
    es.[WEIGHT_UNIT] as shipmentWeightUnit,
    es.[COUNTRY_ORIGIN_GOODS]as countryOriginGoods,
    es.[DECLARED_VALUE] as declaredValue ,
    es.[INVOICE_TOTAL] as invoiceTotal ,
    es.[CURRENCY_CODE_INVOICE_TOTAL] as invoiceCurrencyCode,
    es.[THIRD_PARTY_INDICATOR_CODE] as thirdPartyIndicatorCode ,
    es.[SATURDAY_DELIVERY_FLAGS] as saturdayDeliveryFlag,
    es.[SPECIAL_INSTRUCTION_FLAGS] as specialInstructionFlag,
    es.[INPUT_DATE] as inputDate ,
    es.[SERVICE_LEVEL] as serverLevel,
    es.[FREIGHT_COLLECT_FLAGS] as freightCollectFlag,
    es.[EARLY_AM_INDICATOR] as earlyAmIndicator,
    es.[OVER_31_8_KGS70_LBS_FLAGS] as overWeight,
    es.[DATE_SHIPMENT] as dateShipped,
    es.[BILLING_TERM_FIELD] as billingTermField,
    es.[DIMENSIONAL_WEIGHT] as dimensionalWeight,
    es.[DIMENSIONAL_WIEGHT_UNIT] as dimensionalWeightUnit ,
    es.[CONSECUTIVO] as consecutivo,
    es.[Peso_Kilos],
    es.[Peso_Libras],

    (SELECT
        esi.[INVOICE_UNIT_QUANTITY] AS unitQuantity,
        esi.[INVOICE_CODE] AS code,
        esi.[INVOICE_DESCRIPTION] AS description,
        esi.[INVOICE_PRICE] AS price,
        esi.[INVOICE_CURRENCY_CODE] AS currencyCode,
        esi.[INVOICE_NUMBER] AS number,
        esi.[INVOICE_PAIS] AS countryOrigin
     FOR JSON PATH) AS invoice,

    (SELECT
        esh.[EXPANDED_PACKAGE_TRACKING_NUMBER] AS trackingNumber,
        esh.[PACKAGE_WEIGHT] AS weight,
        esh.[PACKAGE_WEIGHT_UNIT] AS weightUnit,
        esh.[OVERSIZE_PACKAGE_FLAG] AS oversize
     FROM [dbo].[EXPORT_SHIPMENT_HIJOS] esh
     WHERE esh.[CONSECUTIVO_SHIPMENT] = es.[CONSECUTIVO]  -- Filtrar por el mismo consecutivo
     FOR JSON PATH) AS package,

    (SELECT
        es.[WEIGHT_1_PACKAGE_IN_SHIPMENT] AS weight1Package,
        es.[WEIGHT_UNIT_1_PACKAGE] AS weightUnit1Package,
        es.[PACKAGE_TRACKING_NUMBER] AS packageTrackingNumber,
        es.[OVERSIZE_PACKAGE_FLAGS] AS oversizeFlags
     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER) AS packagePush,

    (SELECT
        es.[SHIPPER_NUMBER] as number,
        es.[SHIPPER_COMPANY] AS company,
        (ISNULL(es.[SHIPPER_BUILDING], '') + ' ' + ISNULL(es.[SHIPPER_STREET], '')) AS address ,
        es.[SHIPPER_CITY] AS city,
        es.[SHIPPER_COUNTY] AS county,
        es.[SHIPPER_STATE] AS state,
        es.[SHIPPER_POSTAL_CODE] AS postalCode,
        es.[SHIPPER_COUNTRY] AS country,
        es.[SHIPPER_PHONE_NUMBER] AS phoneNumber,
        es.[SHIPPER_CONTACT_NAME] as contactName,
        es.[SHIPPER_CUSTOMS_EIN_NUMBER] as customEINNumber
     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER) AS shipper,

    (SELECT
        es.[CONSIGNEE_COMPANY] AS company,
        es.[CONSIGNEE_CONTACT_NAME] AS contactName,
        (ISNULL(es.[CONSIGNEE_BUILDING], '') + ' ' + ISNULL(es.[CONSIGNEE_STREET], '')) AS address ,
        es.[CONSIGNEE_CITY] AS city,
        es.[CONSIGNEE_COUNTY] AS county,
        es.[CONSIGNEE_STATE] AS state,
        es.[CONSIGNEE_POSTAL_CODE] AS postalCode,
        es.[CONSIGNEE_COUNTRY_CODE] AS country,
        es.[CONSIGNEE_PHONE_NUMBER] AS phoneNumber,
            es.[CONSIGNEE_FAX_NUMBER] as faxNumber ,
          es.[CONSIGNEE_PO_NUMBER] as poNumber,
    es.[ALTERNATE_TRACKING_NUMBER_2] as alternateTrackingNumber2
     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER) AS consignee,

    (SELECT
        es.[SHIPPER_3RD_PARTY_ACCOUNT_NUMBER] AS accountNumber,
        es.[SHIPPER_3RD_PARTY_COMPANY] AS company,
        es.[SHIPPER_3RD_PARTY_COUNTRY] AS country
     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER) AS shipper3Party

    FROM [dbo].[EXPORT_SHIPMENT] es
    LEFT JOIN [dbo].[EXPORT_SHIPMENT_INVOICE] esi
        ON es.[CONSECUTIVO] = esi.[CONSECUTIVO_SHIPMENT]
    LEFT JOIN [dbo].[EXPORT_SHIPMENT_HIJOS] esh
        ON es.[CONSECUTIVO] = esh.[CONSECUTIVO_SHIPMENT]

     WHERE FECHA_CARGA >= '2020-01-01'
  AND FECHA_CARGA <= '2020-02-25'
    ORDER BY es.[FECHA_CARGA] DESC`

const inicio = new Date()

var mongo = new (require('./mongo.js').Mongo)(to)

function transform(data) {

  // Verifica si p.package es un string, si lo es, lo convierte a un objeto
  if (typeof data.package === 'string') {
    data.package = JSON.parse(data.package)
  }

  // Si p.package es un objeto, lo convierte a un array que contiene el objeto
  if (!Array.isArray(data.package)) {
    data.package = [JSON.parse(data.package)] // Convierte el objeto en un array con un solo elemento
  }
  // Suponiendo que p.invoice es un string que contiene un array en formato JSON
  var invoiceArray = JSON.parse(data.invoice)

  // Verifica si el resultado es un array
  if (Array.isArray(invoiceArray) && invoiceArray.length > 0) {
    // Convierte el array en un objeto usando solo la primera posición
    data.invoice = invoiceArray[0]
  }


  var packages = data.package || []
  data.shipper = JSON.parse(data.shipper)
  data.shipper3Party = JSON.parse(data.shipper3Party)
  data.consignee = JSON.parse(data.consignee)
  // p.invoice= JSON.parse(p.invoice)
  packages.unshift(JSON.parse(data.packagePush))
  data.package = packages
  delete data.packagePush
  data.importDate = new Date(data.importDate)
  data.deliveryDate = new Date(data.deliveryDate)
  data.inputDate = new Date(data.inputDate)
  data.dateShipped = new Date(data.dateShipped)

  return data
}


mongo.client.connect().then(async () => {
  var docs = mongo.db().collection(collection).initializeUnorderedBulkOp()
  var ids = mongo.db().collection(collection2).initializeUnorderedBulkOp()
  const sql = require('mssql')
  const pool = await new sql.ConnectionPool(from).connect()
  const qy = pool.request()
  qy.stream = true // You can set streaming differently for each request
  qy.query(query) // or request.execute(procedure)

  let i = 0
  qy.on('row', data => {
    let doc = transform(data)
    docs.insert(doc)
    ids.insert({ _id: doc._id, table: 'EXPORT_SHIPMENT', idSql: data.consecutivo })
    i += 1
    if (i > 10) {
      ids.execute()
      ids = mongo.db().collection(collection2).initializeUnorderedBulkOp()
      docs.execute()
      docs = mongo.db().collection(collection).initializeUnorderedBulkOp()
      i = 0
    }
  })
  qy.on('done', () => {
    if (i) {
      ids.execute()
      docs.execute()
    }
    var dur = (new Date().getTime() - inicio.getTime()) / 1000
    console.log('Duración: ' + dur)
  })
  qy.on('error', (err) => {
    console.log(err)
  })
})